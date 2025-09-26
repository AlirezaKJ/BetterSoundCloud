const { ipcRenderer } = require("electron");
const fs = require("fs");
const packagefile = require("../package.json");
const scdl = require("soundcloud-downloader").default;
const https = require("https");
const { f } = require("@cliqz/adblocker-electron");
const path = require("path");

// Discord RPC
const { Client, StatusDisplayType } = require("@xhayper/discord-rpc");
const { ActivityType } = require("discord-api-types/v10");
const client = new Client({
  clientId: "1054636117284106270", // Discord App Client ID
});

const clientVersion = packagefile.version;
const startingTimestamp = Date.now();

let appdirectory;
ipcRenderer.on("apppath", function (evt, message) {
  console.log(message);
  appdirectory = message;
});

let webview = document.querySelector("#webview");
if (settings["startupurl"] != false) {
  webview.setAttribute("src", settings["startupurl"]);
} else if (settings["startuplastpage"]) {
  webview.setAttribute("src", settings["lasturlvisited"]);
} else {
  webview.setAttribute("src", "https://soundcloud.com/discover");
}
console.log(webview);

let rclickmenu = document.querySelector(".mousectx");
let interfaceel = document.querySelector(".interface");

// CURSONGINFO
let cursonginfo = {
  songtitle: "",
  songartist: "",
  songcover: "",
  songurl: "",
  songliked: false,
  songduration: "",
  songcurrentdur: "",
  songstate: "",
  songlyric: "",
  lyricssynced: false,
};

function toSeconds(hhmmss) {
  if (!hhmmss) return 0;
  const parts = hhmmss.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0] || 0);
}

function calcTimestamps(currentStr, totalStr) {
  const now = Date.now();
  const cur = toSeconds(currentStr);
  const tot = toSeconds(totalStr);
  if (!Number.isFinite(cur) || cur < 0 || !Number.isFinite(tot) || tot <= 0)
    return null;
  const start = now - cur * 1000;
  const end = start + tot * 1000;
  return { start, end };
}

let lastActivity = null;
function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const va = a[k],
      vb = b[k];
    if (typeof va === "object" && typeof vb === "object") {
      if (!shallowEqual(va, vb)) return false;
    } else if (va !== vb) return false;
  }
  return true;
}

let mouseinf = {
  selection: "",
};

// ! READ CONSOLE MESSAGES
// USED AS A CHANNEL FOR COMMUNICATION BETWEEN WEBVIEW AND RENDERER
webview.addEventListener("console-message", (e) => {
  console.log(e.message);
  if (e.message == "BSCReceive|MouseClicked") {
    rclickmenu.classList.add("fademctx");
  } else if (e.message == "BSCReceive|UISettingMaximizeApp") {
    console.log("sendmaximize req");
    ipcRenderer.send("appReqMaximizeApp");
  } else if (e.message == "BSCReceive|UISettingMinimizeApp") {
    console.log("sendminimize req");
    ipcRenderer.send("appReqMinimizeApp");
  } else if (e.message == "BSCReceive|UISettingCloseApp") {
    console.log("sendclose req");
    ipcRenderer.send("appReqCloseApp");
  } else if (e.message.split("|")[1] == "UISettingShowRequest") {
    opensettings();
    sidebtns = document.querySelectorAll(".interface .sidebar .side-btn");
    if (e.message.split("|")[2] == "1") {
      sidebtns[0].click();
    } else if (e.message.split("|")[2] == "2") {
      sidebtns[2].click();
    }
  } else if (e.message.split("|")[1] == "Paused") {
    cursonginfo.songstate = "paused";
  } else if (e.message.split("|")[1] == "Playing") {
    cursonginfo.songstate = "playing";
  } else if (e.message.split("|")[1] == "CurrentDur") {
    cursonginfo.songcurrentdur = e.message.split("|")[2];
  } else if (e.message.split("|")[1] == "EndDur") {
    cursonginfo.songduration = e.message.split("|")[2];
  } else if (e.message.split("|")[1] == "CurSongTitle") {
    if (cursonginfo.songtitle != e.message.split("|")[2]) {
      cursonginfo.songtitle = e.message.split("|")[2];
      console.log("songswap occured");
      setTimeout(updatelyricshowcase, 1000);
    } else {
      cursonginfo.songtitle = e.message.split("|")[2];
    }
  } else if (e.message.split("|")[1] == "CurSongArtist") {
    cursonginfo.songartist = e.message.split("|")[2];
  } else if (e.message.split("|")[1] == "CurSongLiked") {
    if (e.message.split("|")[2] == "true") {
      cursonginfo.songliked = true;
    } else {
      cursonginfo.songliked = false;
    }
  } else if (e.message.split("|")[1] == "CurSongCoverUrl") {
    cursonginfo.songcover = e.message
      .split("|")[2]
      .replace("t50x50", "t500x500");
  } else if (e.message.split("|")[1] == "CurSongUrl") {
    songurlstring = "https://soundcloud.com/" + e.message.split("|")[2];
    songurlstring = songurlstring.replace("t50x50", "t500x500");
    cursonginfo.songurl = songurlstring;
  } else if (e.message.split("|")[1] == "UIActivateLyricShowCase") {
    lyricshowcaseopen();
  } else if (e.message.split("|")[1] == "UIActivateShowCase") {
    showsongshowcase();
  } else if (e.message.split("|")[1] == "UISettingPreviousFrame") {
    webview.goBack();
  } else if (e.message.split("|")[1] == "UISettingNextFrame") {
    webview.goForward();
  } else if (e.message.split("|")[1] == "scinotloaded") {
    console.log("Trying to add SCI script again");
    addscript(path.join("plugins", "SCI.js"));
  } else if (e.message.split("|")[1] == "sciloaded") {
    console.log("SCI has been loaded succesfuly");
    clearInterval(sciloadingcheck);
  }
});

``;

// ! Discord RPC LOOP function

async function updateDiscordActivity() {
  if (!client) return;

  let userviewpage = "Discover";
  try {
    const url = new URL(webview.getURL());
    userviewpage = url.pathname.split("/")[1] || "Discover";
  } catch {}

  const isPause = cursonginfo.songstate === "paused";
  const title = cursonginfo.songtitle || "Unknown Title";
  const artist = cursonginfo.songartist || "Unknown Artist";

  const largeImageKey = isPause
    ? "bw-exploring-bordered-white"
    : cursonginfo.songcover;
  const largeImageText = isPause ? "Exploring SoundCloud" : "";

  const ts = calcTimestamps(
    cursonginfo.songcurrentdur,
    cursonginfo.songduration,
  );

  const activity = {
    type: ActivityType.Listening,
    details: isPause ? "BetterSoundCloud" : `${title}`,
    state: isPause ? `At ${userviewpage}` : `${artist}`,
    largeImageKey,
    largeImageText,
    smallImageKey: "bw-icon-bordered-white",
    smallImageText: `V${clientVersion}`,
    instance: false,
    startTimestamp: startingTimestamp,
    statusDisplayType: StatusDisplayType.DETAILS,
  };

  if (!isPause && ts) {
    activity.startTimestamp = ts.start;
    activity.endTimestamp = ts.end;
  }

  if (shallowEqual(activity, lastActivity)) return;
  lastActivity = activity;

  await client.user.setActivity(activity);
}

client.on("disconnected", (event) => {
  console.log(
    `Discord RPC disconnected! Code: ${event.code}, Reason: ${event.reason}`,
  );
});

client.once("ready", () => {
  console.log("Discord RPC is ready!");
  setInterval(() => {
    if (settings.discordrpc == true) {
      updateDiscordActivity();
    }
  }, 1000);
});

client.login().catch((err) => console.error(err));

let lyricshowcase = document.querySelector("#lyricshowcase");
let lyriccoldiv = document.querySelector("#lyricshowcase .lyriccol");
let syncedlyricsinterval;
function updatelyricshowcase() {
  var songname;
  var songartist;
  if (cursonginfo.songtitle.split("-").length == 2) {
    songname = cursonginfo.songtitle.split("-")[1];
    songartist = cursonginfo.songtitle.split("-")[0];
  } else {
    songname = cursonginfo.songtitle;
    songartist = cursonginfo.songartist;
  }
  lyriccoldiv.innerHTML = `<div class="searchline">SEARCHING FOR ${songname} - ${songartist} THROUGH LRCLIB</div>`;

  var url = `https://lrclib.net/api/get?artist_name=${songartist}&track_name=${songname}`;

  https.get(url, function (response) {
    var buffer = "";
    var data;
    var lyrics = "";

    response.on("data", function (chunk) {
      buffer += chunk;
    });
    response.on("end", function (err) {
      console.log(buffer);
      console.log("\n");
      data = JSON.parse(buffer);
      console.log(data);
      if (data.syncedLyrics) {
        // TODO: USE THE SYNCED LYRICS TIMESTAMP TO HIGHLIGHT SPECIFIC LINE
        console.log(data.syncedLyrics);
        lyrics = data.syncedLyrics;
        cursonginfo.songlyric = data.syncedLyrics;
        cursonginfo.lyricssynced = true;
        lyriccoldiv.innerHTML = ``;
        lyrics.split("\n").forEach((line) => {
          time = line.split("]")[0].substring(1).slice(0, -3).split(":");
          time = parseInt(time[0]) * 60 + parseInt(time[1]);
          bar = line.substring(10);
          console.log(bar);
          lyriccoldiv.innerHTML += `<div data-tstamp="${time}" class="lyricline">${bar}</div>`;
        });
        lyricsyncloop();
      } else if (data.plainLyrics) {
        lyrics = data.plainLyrics;
        cursonginfo.songlyric = data.plainLyrics;
        cursonginfo.lyricssynced = false;
        lyriccoldiv.innerHTML = ``;
        lyrics.split("\n").forEach((line) => {
          lyriccoldiv.innerHTML += `<div class="lyricline">${line}</div>`;
        });
      } else {
        console.log("no lyrics found", err);
        cursonginfo.songlyric = "not found";
        cursonginfo.lyricssynced = false;
        lyriccoldiv.innerHTML += `<div class="searchline">DIDN'T FIND ANY LYRICS FOR ${songname} - ${songartist}</div>`;
      }
    });
  });
}
function lyricsyncloop() {
  syncedlyricsinterval = setInterval(() => {
    lyriclines = document.querySelectorAll(
      "#lyricshowcase .lyriccol .lyricline",
    );
    currentsongtimesum = cursonginfo.songcurrentdur.split(":");
    if (currentsongtimesum.length == 2) {
      currentsongtimesum =
        parseInt(currentsongtimesum[0]) * 60 + parseInt(currentsongtimesum[1]);
    } else {
      currentsongtimesum = parseInt(currentsongtimesum[0]);
    }
    console.log(currentsongtimesum);
    lyriclines.forEach((element) => {
      if (currentsongtimesum > element.dataset.tstamp - 1) {
        element.classList.add("lyricpassed");
      }
    });
    if (lyricshowcase.classList.contains("fadelyricshowcase")) {
      clearInterval(syncedlyricsinterval);
    }
  }, 500);
}

function lyricshowcaseopen() {
  updatelyricshowcase();
  lyricshowcase.classList.remove("fadelyricshowcase");
}

function lyricshowcasecls() {
  lyricshowcase.classList.add("fadelyricshowcase");
}

// FOR SONG SHOWCASE
let songshowcase = document.getElementById("songshowcase");
let songshowcaseInterval;
let songshowcasecoverimgel = document.getElementById("songshowcasecoverimg");
let songshowcasetitleel = document.getElementById("songshowcasesongtitle");
let songshowcaseartistel = document.getElementById("songshowcasesongartist");
let songshowcasecurtimeel = document.getElementById("songshowcasecurtime");
let songshowcaseendtimeel = document.getElementById("songshowcaseendtime");
let songshowcasefillbarel = document.getElementById("progfillbar");
function showsongshowcase() {
  songshowcase.classList.remove("fadesongshowcase");
  songshowcaseInterval = setInterval(() => {
    songshowcasecoverimgel.src = cursonginfo.songcover;
    songshowcasetitleel.innerHTML = cursonginfo.songtitle;
    songshowcaseartistel.innerHTML = cursonginfo.songartist;
    songshowcasecurtimeel.innerHTML = cursonginfo.songcurrentdur;
    songshowcaseendtimeel.innerHTML = cursonginfo.songduration;
    var currentdur = cursonginfo.songcurrentdur.split(":");
    if (currentdur.length == 2) {
      currentdur = parseInt(currentdur[0]) * 60 + parseInt(currentdur[1]);
    } else {
      currentdur = parseInt(currentdur[0]);
    }
    var fulldur = cursonginfo.songduration.split(":");
    if (fulldur.length == 2) {
      fulldur = parseInt(fulldur[0]) * 60 + parseInt(fulldur[1]);
    } else {
      fulldur = parseInt(fulldur[0]);
    }
    console.log(currentdur);
    console.log(fulldur);
    var fill_percentage = (currentdur / fulldur) * 100;
    songshowcasefillbarel.style.width = fill_percentage + "%";
  }, 500);
}

function songshowcasecls() {
  clearInterval(songshowcaseInterval);
  songshowcase.classList.add("fadesongshowcase");
}

// READ FILES
function readfile(src) {
  data = fs.readFileSync(src, "utf8");
  loadingscreentxt.innerHTML = "Readed File: " + src;
  return data;
}

// FOR LOADING PLUGINS
function addscript(src) {
  let code = readfile(path.join(appdirectory, src));
  loadingscreentxt.innerHTML = "Added Script: " + src;
  webview.executeJavaScript(code);
}
// FOR LOADING THEMES
function addstyle(src) {
  var code = readfile(path.join(appdirectory, src));
  loadingscreentxt.innerHTML = "Added Style: " + src;
  webview.insertCSS(code);
}

function scdownloaderbtnreq() {
  var downloadurl = document.querySelector("#downloadurl").value;
  console.log(appdirectory);
  console.log(downloadurl);
  songtitle = "audio";
  // Create Downloads folder if it doesn't exist
  if (!fs.existsSync(`${appdirectory}/Downloads`)) {
    fs.mkdirSync(`${appdirectory}/Downloads`);
  }
  let tooltip = document.querySelector("#downloaderstatusspan");
  scdl.getInfo(downloadurl).then((info) => {
    songtitle = info.title;
    console.log(songtitle);
    tooltip.innerHTML = "Started Downloading " + songtitle;
    scdl.download(downloadurl).then((stream) => {
      stream.pipe(
        fs.createWriteStream(`${appdirectory}/Downloads/${songtitle}.mp3`),
      );
      tooltip.innerHTML = `Saved to ${appdirectory}/Downloads/${songtitle}.mp3`;
      // ipcRenderer.send("appDownloaderFinish");
    });
  });
}

// Handle Custom Media keys functionality
ipcRenderer.on("appReqMediaPlayPause", function (evt, message) {
  webview.executeJavaScript(`playpausebtn.click()`);
  console.log("MediaPlayPause is pressed");
});
ipcRenderer.on("appReqMediaNextTrack", function (evt, message) {
  webview.executeJavaScript(`nextsongbtn.click()`);
  console.log("MediaNextTrack is pressed");
});
ipcRenderer.on("appReqMediaPreviousTrack", function (evt, message) {
  webview.executeJavaScript(`previoussongbtn.click()`);
  console.log("MediaPreviousTrack is pressed");
});

// Handle Custom Keyboard keys functionality
ipcRenderer.on("appReqCtrlR", function (evt, message) {
  if (settings["bindctrlr"] == "reloadview") {
    webview.reload();
  } else if (settings["bindctrlr"] == "reloadapp") {
    ipcRenderer.send("appReqReloadApp");
  } else {
    console.log("unbind cntrl r");
  }
  console.log("CtrlR is pressed");
});

ipcRenderer.on("appReqF5", function (evt, message) {
  if (settings["bindf5"] == "reloadview") {
    webview.reload();
  } else if (settings["bindf5"] == "reloadapp") {
    ipcRenderer.send("appReqReloadApp");
  } else {
    console.log("unbind f5");
  }
  console.log("F5 is pressed");
});

ipcRenderer.on("fixviewicons", function (evt, message) {
  console.log(message);
  if (message == "1icon") {
    webview.executeJavaScript(`maximizebtn.classList.add("header__appmaximizebtn__alt")
    minimizebtn.style.display = "none"
    closebtn.style.display = "none"`);
  } else if (message == "3icon") {
    webview.executeJavaScript(`maximizebtn.classList.remove("header__appmaximizebtn__alt")
    minimizebtn.style.display = "flex"
    closebtn.style.display = "flex"`);
  }
});

let scrollerbtn = document.getElementById("scrollerbtn");
if (settings.scrollerbtn == true) {
  scrollerbtn.classList.add("scrlbtnvis");
}

var btnscrlinterval;
function scrollbtntgl() {
  scrollerbtn.classList.toggle("scrlbtnactive");
  if (scrollerbtn.classList.contains("scrlbtnactive")) {
    btnscrlinterval = setInterval(webviewscrldown, 50);
  } else {
    clearInterval(btnscrlinterval);
  }
}

function webviewscrldown() {
  console.log("scrolling");
  webview.executeJavaScript("window.scrollBy(0, 500)");
}
