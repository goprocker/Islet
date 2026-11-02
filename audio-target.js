// Which process's audio to capture for the player on show. Windows names a player by its
// app id, not a process, so each id needs a deliberate mapping. An unknown one gives ""
// (a flat wave) rather than a guess that could capture some other app's sound.
const KNOWN = [
  [/spotify/i, "Spotify"],
  [/^chrome$|^chrome\.exe$/i, "chrome"],
  [/^msedge$|^msedge\.exe$|^microsoft\.?edge/i, "msedge"],
  [/^brave$|^brave\.exe$/i, "brave"],
  [/^opera$|^opera\.exe$/i, "opera"],
  [/^308046B0AF4A39CB$|^firefox(\.exe)?$/i, "firefox"], // Firefox's installed app id
  [/^AppleInc\.AppleMusicWin_/i, "AppleMusic"],
  [/^Microsoft\.ZuneMusic_/i, "Microsoft.Media.Player"],
];

function audioTarget(source) {
  if (typeof source !== "string" || !source) return "";
  const known = KNOWN.find(([id]) => id.test(source));
  if (known) return known[1];
  // desktop players are usually named by their exe: "vlc.exe", or a full path to it
  const exe = source.match(/(?:^|[\\/])([\w.-]+)\.exe$/i);
  return exe ? exe[1] : "";
}

module.exports = { audioTarget };
