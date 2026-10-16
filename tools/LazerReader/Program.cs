using Realms;
using System.Collections;
using System.Text.Json;

// The game database is always opened read-only. No migrations or writes are performed.
try
{
    if (args.Length != 1) throw new ArgumentException("Expected the osu!lazer storage directory.");
    var root = Path.GetFullPath(args[0]);
    var database = Path.Combine(root, "client.realm");
    if (!File.Exists(database)) throw new FileNotFoundException("client.realm was not found in this folder.");
    using var realm = Realm.GetInstance(new RealmConfiguration(database) { IsDynamic = true, IsReadOnly = true });
    var sets = realm.DynamicApi.All("BeatmapSet");
    var tracks = new List<LazerTrack>();
    var seen = new Dictionary<string,LazerTrack>(StringComparer.OrdinalIgnoreCase);
    var skipped = 0;
    string? Resolve(string hash)
    {
        if (hash.Length != 64 || !hash.All(Uri.IsHexDigit)) return null;
        var file = Path.Combine(root, "files", hash[..1], hash[..2], hash);
        return File.Exists(file) ? file : null;
    }
    foreach (dynamic set in sets)
    {
        if ((bool)set.DeletePending) continue;
        long? onlineSetId = null;
        try { long candidate = (long)set.OnlineID; if (candidate > 0) onlineSetId = candidate; } catch (Microsoft.CSharp.RuntimeBinder.RuntimeBinderException) { }
        var files = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (dynamic usage in set.Files)
        {
            string name = usage.Filename;
            string hash = usage.File.Hash;
            var path = Resolve(hash);
            if (path != null) files[name.Replace('\\', '/')] = path;
        }
        foreach (var pair in files.Where(f => f.Key.EndsWith(".osu", StringComparison.OrdinalIgnoreCase)))
        {
            try
            {
                string title = "", artist = "", creator = "", audio = "";
                string? background = null;
                int mode = 0;
                long? beatmapSetId = null;
                string section = "";
                foreach (var original in File.ReadLines(pair.Value))
                {
                    var line = original.Trim().TrimStart('\uFEFF');
                    if (line.StartsWith('[')) { section = line; continue; }
                    if (section is "[General]" or "[Metadata]")
                    {
                        var split = line.IndexOf(':');
                        if (split < 0) continue;
                        var key = line[..split].Trim();
                        var value = line[(split + 1)..].Trim();
                        switch ((section, key))
                        {
                            case ("[General]", "AudioFilename"): audio = value.Trim('"').Replace('\\','/'); break;
                            case ("[Metadata]", "Title"): title = value; break;
                            case ("[Metadata]", "Artist"): artist = value; break;
                            case ("[Metadata]", "Creator"): creator = value; break;
                            case ("[General]", "Mode"): mode = int.TryParse(value, out var parsedMode) ? parsedMode : 0; break;
                            case ("[Metadata]", "BeatmapSetID"): beatmapSetId = long.TryParse(value, out var parsedId) && parsedId > 0 ? parsedId : null; break;
                        }
                    }
                    if (section == "[Events]")
                    {
                        var parts = line.Split(',', 3);
                        if (parts.Length == 3 && (parts[0] == "0" || parts[0] == "Background") && parts[1] == "0")
                        {
                            var rest = parts[2];
                            background = rest.StartsWith('"') ? rest[1..].Split('"')[0] : rest.Split(',')[0];
                        }
                    }
                }
                beatmapSetId ??= onlineSetId;
                var parent = pair.Key.Contains('/') ? pair.Key[..(pair.Key.LastIndexOf('/') + 1)] : "";
                if (!files.TryGetValue(parent + audio, out var audioPath)) { skipped++; continue; }
                if (seen.TryGetValue(audioPath, out var existing)) { if (!existing.modes.Contains(mode)) existing.modes.Add(mode); existing.beatmapSetId ??= beatmapSetId; continue; }
                string? artwork = null;
                if (background != null) files.TryGetValue(parent + background.Replace('\\','/'), out artwork);
                var track = new LazerTrack { id = audioPath, title = title.Length > 0 ? title : audio, artist = artist.Length > 0 ? artist : "Unknown artist", creator = creator, audioPath = audioPath, backgroundPath = artwork, modes = new List<int> { mode }, beatmapSetId = beatmapSetId };
                tracks.Add(track);
                seen[audioPath] = track;
            }
            catch (IOException) { skipped++; }
        }
    }
    Console.Write(JsonSerializer.Serialize(new { tracks, skipped }));
    return 0;
}
catch (Exception error)
{
    Console.Error.Write(error.Message);
    return 1;
}

class LazerTrack {
 public string id {get;set;} = "";
 public string title {get;set;} = "";
 public string artist {get;set;} = "";
 public string creator {get;set;} = "";
 public string audioPath {get;set;} = "";
 public string? backgroundPath {get;set;}
 public string[] sources {get;set;} = new[] {"lazer"};
 public List<int> modes {get;set;} = new();
 public long? beatmapSetId {get;set;}
}

