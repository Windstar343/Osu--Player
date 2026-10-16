use discord_rich_presence::{error::Error, DiscordIpc};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Write},
    os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
    time::{Duration, Instant},
};
use windows_sys::Win32::System::Pipes::PeekNamedPipe;

/// Discord's local named pipe with bounded reads, so a stopped client cannot
/// leave the presence worker stuck while the user disables sharing.
pub struct DiscordConnection {
    client_id: String,
    socket: Option<File>,
}
impl DiscordConnection {
    pub fn new(id: &str) -> Self {
        Self {
            client_id: id.into(),
            socket: None,
        }
    }
}
impl DiscordIpc for DiscordConnection {
    fn get_client_id(&self) -> &str {
        &self.client_id
    }
    fn connect_ipc(&mut self) -> Result<(), Error> {
        for index in 0..10 {
            if let Ok(file) = OpenOptions::new()
                .access_mode(3)
                .open(format!(r"\\?\pipe\discord-ipc-{index}"))
            {
                self.socket = Some(file);
                return Ok(());
            }
        }
        Err(Error::IPCConnectionFailed)
    }
    fn write(&mut self, bytes: &[u8]) -> Result<(), Error> {
        self.socket
            .as_mut()
            .ok_or(Error::NotConnected)?
            .write_all(bytes)
            .map_err(Error::WriteError)
    }
    fn read(&mut self, buffer: &mut [u8]) -> Result<(), Error> {
        let file = self.socket.as_mut().ok_or(Error::NotConnected)?;
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut offset = 0;
        while offset < buffer.len() {
            let mut available = 0;
            let success = unsafe {
                PeekNamedPipe(
                    file.as_raw_handle() as _,
                    std::ptr::null_mut(),
                    0,
                    std::ptr::null_mut(),
                    &mut available,
                    std::ptr::null_mut(),
                )
            };
            if success == 0 {
                return Err(Error::ReadError(std::io::Error::last_os_error()));
            }
            if available > 0 {
                let length = (available as usize).min(buffer.len() - offset);
                let count = file
                    .read(&mut buffer[offset..offset + length])
                    .map_err(Error::ReadError)?;
                if count == 0 {
                    return Err(Error::ReadError(std::io::Error::from(
                        std::io::ErrorKind::UnexpectedEof,
                    )));
                }
                offset += count;
            } else if Instant::now() >= deadline {
                return Err(Error::ReadError(std::io::Error::from(
                    std::io::ErrorKind::TimedOut,
                )));
            } else {
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        Ok(())
    }
    fn close(&mut self) -> Result<(), Error> {
        self.socket.take();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        os::windows::io::FromRawHandle,
        sync::atomic::{AtomicUsize, Ordering},
    };
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        System::Pipes::{
            ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_TYPE_BYTE, PIPE_WAIT,
        },
    };
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    fn server() -> (usize, String) {
        let name = format!(
            r"\\.\pipe\osu-player-presence-test-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let handle = unsafe {
            CreateNamedPipeW(
                wide.as_ptr(),
                3,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                1,
                4096,
                4096,
                0,
                std::ptr::null(),
            )
        };
        assert_ne!(handle, INVALID_HANDLE_VALUE);
        (handle as usize, name)
    }
    fn read_frame(file: &mut File) -> serde_json::Value {
        let mut header = [0u8; 8];
        file.read_exact(&mut header).unwrap();
        let size = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        let mut body = vec![0; size];
        file.read_exact(&mut body).unwrap();
        serde_json::from_slice(&body).unwrap()
    }
    fn frame(file: &mut File, value: serde_json::Value) {
        let data = serde_json::to_vec(&value).unwrap();
        file.write_all(&1u32.to_le_bytes()).unwrap();
        file.write_all(&(data.len() as u32).to_le_bytes()).unwrap();
        file.write_all(&data).unwrap();
    }
    #[test]
    fn discord_handshake_and_activity_acknowledgement_use_only_the_test_pipe() {
        let (handle, name) = server();
        let thread = std::thread::spawn(move || {
            unsafe {
                ConnectNamedPipe(handle as _, std::ptr::null_mut());
            }
            let mut file = unsafe { File::from_raw_handle(handle as _) };
            let handshake = read_frame(&mut file);
            assert_eq!(handshake["client_id"], "123456789012345678");
            frame(
                &mut file,
                serde_json::json!({"cmd":"DISPATCH","evt":"READY","data":{}}),
            );
            let request = read_frame(&mut file);
            assert_eq!(request["cmd"], "SET_ACTIVITY");
            assert_eq!(request["args"]["activity"]["details"], "Test song");
            frame(
                &mut file,
                serde_json::json!({"cmd":"SET_ACTIVITY","evt":null,"data":{}}),
            );
            let _ = file.read(&mut [0u8; 1]);
        });
        let mut connection = DiscordConnection {
            client_id: "123456789012345678".into(),
            socket: Some(OpenOptions::new().access_mode(3).open(name).unwrap()),
        };
        connection.send_handshake().unwrap();
        super::super::discord::send_activity(
            &mut connection,
            discord_rich_presence::activity::Activity::new()
                .details("Test song")
                .state("Test artist"),
        )
        .unwrap();
        connection.close().unwrap();
        thread.join().unwrap();
    }
    #[test]
    fn stopped_discord_reads_time_out_instead_of_blocking_sharing_controls() {
        let (handle, name) = server();
        let thread = std::thread::spawn(move || {
            unsafe {
                ConnectNamedPipe(handle as _, std::ptr::null_mut());
            }
            let _file = unsafe { File::from_raw_handle(handle as _) };
            std::thread::sleep(Duration::from_millis(2500));
        });
        let mut connection = DiscordConnection {
            client_id: "test".into(),
            socket: Some(OpenOptions::new().access_mode(3).open(name).unwrap()),
        };
        let started = Instant::now();
        assert!(connection.read(&mut [0u8; 1]).is_err());
        assert!(started.elapsed() < Duration::from_secs(3));
        connection.close().unwrap();
        thread.join().unwrap();
    }
}
