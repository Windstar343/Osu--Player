#[cfg(windows)]
use super::discord_pipe::DiscordConnection;
#[cfg(not(windows))]
use discord_rich_presence::DiscordIpcClient as DiscordConnection;
use discord_rich_presence::{activity, DiscordIpc};
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const APPLICATION_ID: &str = match option_env!("OSU_PLAYER_DISCORD_APP_ID") {
    Some(value) => value,
    None => "",
};

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub enabled: bool,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub playing: bool,
    #[serde(default)]
    pub position: f64,
    #[serde(default)]
    pub duration: f64,
    #[serde(default = "default_rate")]
    pub rate: f64,
    #[serde(default)]
    pub beatmap_set_id: Option<i64>,
}
fn default_rate() -> f64 {
    1.0
}
#[derive(Clone)]
pub struct DiscordPresence {
    request: Arc<Mutex<(Presence, Instant)>>,
    status: Arc<Mutex<String>>,
}
impl Default for DiscordPresence {
    fn default() -> Self {
        let state = Self {
            request: Arc::new(Mutex::new((Presence::default(), Instant::now()))),
            status: Arc::new(Mutex::new("Off".into())),
        };
        let worker = state.clone();
        std::thread::Builder::new()
            .name("discord-presence".into())
            .spawn(move || worker.run())
            .expect("Could not start Discord worker");
        state
    }
}
impl DiscordPresence {
    fn status(&self, text: &str) {
        if let Ok(mut status) = self.status.lock() {
            *status = text.into();
        }
    }
    fn run(self) {
        let mut client: Option<DiscordConnection> = None;
        let mut previous = String::new();
        let mut last_sent: Option<Instant> = None;
        let mut sent_times: Option<(i64, Option<i64>)> = None;
        loop {
            let (mut request, received_at) = self
                .request
                .lock()
                .map(|r| r.clone())
                .unwrap_or_else(|_| (Presence::default(), Instant::now()));
            if request.playing {
                request.position += received_at.elapsed().as_secs_f64() * request.rate;
            }
            if !request.enabled
                || !request.playing
                || request.title.is_empty()
                || APPLICATION_ID.is_empty()
            {
                if let Some(mut connected) = client.take() {
                    let _ = connected.clear_activity();
                    let _ = connected.close();
                }
                previous.clear();
                sent_times = None;
                self.status(if !request.enabled {
                    "Off"
                } else if APPLICATION_ID.is_empty() {
                    "Discord is not configured in this build."
                } else if !request.playing {
                    "Waiting for playback"
                } else {
                    "No song playing"
                });
            } else {
                if client.is_none() {
                    let mut connection = DiscordConnection::new(APPLICATION_ID);
                    match connection.connect() {
                        Ok(()) => {
                            client = Some(connection);
                            previous.clear();
                            sent_times = None;
                        }
                        Err(_) => self.status("Discord desktop is not available. Retrying…"),
                    }
                }
                if let Some(connection) = client.as_mut() {
                    let title = discord_text(&request.title);
                    let state = discord_text(&format!(
                        "{} · {}",
                        request.artist,
                        mode_label(&request.mode)
                    ));
                    let (start, end) = timestamps(request.position, request.duration, request.rate);
                    let cover = request
                        .beatmap_set_id
                        .filter(|id| *id > 0)
                        .map(|id| format!("https://assets.ppy.sh/beatmaps/{id}/covers/cover.jpg"));
                    let key = format!("{title}|{state}|{cover:?}");
                    if last_sent
                        .map(|sent| sent.elapsed() >= Duration::from_secs(15))
                        .unwrap_or(true)
                        || key != previous
                        || sent_times
                            .map(|(old_start, old_end)| {
                                (start - old_start).abs() > 2
                                    || match (end, old_end) {
                                        (Some(a), Some(b)) => (a - b).abs() > 2,
                                        (None, None) => false,
                                        _ => true,
                                    }
                            })
                            .unwrap_or(true)
                    {
                        let mut payload = activity::Activity::new()
                            .activity_type(activity::ActivityType::Listening)
                            .details(&title)
                            .state(&state);
                        if let Some(end) = end {
                            payload = payload
                                .timestamps(activity::Timestamps::new().start(start).end(end));
                        }
                        if let Some(ref cover) = cover {
                            payload = payload.assets(
                                activity::Assets::new()
                                    .large_image(cover)
                                    .large_text("osu! Player"),
                            );
                        }
                        match send_activity(connection, payload) {
                            Ok(()) => {
                                previous = key;
                                last_sent = Some(Instant::now());
                                sent_times = Some((start, end));
                                self.status("Showing your current song on Discord");
                            }
                            Err(error) => {
                                if let Some(mut failed) = client.take() {
                                    let _ = failed.close();
                                }
                                previous.clear();
                                sent_times = None;
                                self.status(&format!("Discord: {error}. Retrying…"));
                            }
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    }
}

pub(crate) fn send_activity(
    connection: &mut DiscordConnection,
    payload: activity::Activity<'_>,
) -> Result<(), String> {
    connection
        .set_activity(payload)
        .map_err(|e| e.to_string())?;
    for _ in 0..4 {
        let (opcode, reply) = connection.recv().map_err(|e| e.to_string())?;
        if opcode == 3 {
            connection.send(reply, 4).map_err(|e| e.to_string())?;
            continue;
        }
        if opcode == 2 || reply["evt"] == "ERROR" {
            return Err(reply["data"]["message"]
                .as_str()
                .unwrap_or("activity rejected")
                .to_string());
        }
        if reply["cmd"] == "SET_ACTIVITY" {
            return Ok(());
        }
    }
    Err("No activity acknowledgement".into())
}

fn mode_label(mode: &str) -> &str {
    match mode {
        "dt" => "DT · 1.5×",
        "nc" => "NC · 1.5×",
        "custom" => "Custom speed",
        _ => "Normal",
    }
}
fn discord_text(text: &str) -> String {
    let mut value = String::new();
    for character in text.chars().filter(|c| !c.is_control()) {
        if value.len() + character.len_utf8() > 100 {
            break;
        }
        value.push(character);
    }
    if value.trim().is_empty() {
        "Unknown".into()
    } else if value.chars().count() < 2 {
        format!("{value} ")
    } else {
        value
    }
}
fn timestamps(position: f64, duration: f64, rate: f64) -> (i64, Option<i64>) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    if !rate.is_finite()
        || rate <= 0.0
        || !position.is_finite()
        || !duration.is_finite()
        || duration <= 0.0
    {
        return (now, None);
    }
    let position = position.clamp(0.0, duration);
    (
        now - (position / rate) as i64,
        Some(now + ((duration - position) / rate).ceil() as i64),
    )
}
#[tauri::command]
pub fn update_discord(
    state: tauri::State<DiscordPresence>,
    presence: Presence,
) -> Result<(), String> {
    let mut request = state.request.lock().map_err(|e| e.to_string())?;
    *request = (
        if presence.enabled {
            presence
        } else {
            Presence::default()
        },
        Instant::now(),
    );
    Ok(())
}
#[tauri::command]
pub fn discord_status(state: tauri::State<DiscordPresence>) -> Result<String, String> {
    state
        .status
        .lock()
        .map(|s| s.clone())
        .map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn presence_limits_text_and_handles_invalid_timing() {
        assert_eq!(discord_text(""), "Unknown");
        assert_eq!(discord_text(&"x".repeat(500)).len(), 100);
        assert!(discord_text(&"🎵".repeat(100)).len() <= 100);
        assert_eq!(discord_text("A\nB"), "AB");
        assert!(timestamps(2.0, 120.0, 0.0).1.is_none());
        let (start, end) = timestamps(30.0, 120.0, 1.5);
        assert!((end.unwrap() - start - 80).abs() <= 1);
    }
}
