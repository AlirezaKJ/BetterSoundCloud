const DiscordRPC = require('discord-rpc')
const clientId = "1054636117284106270"
const RPC = new DiscordRPC.Client({ transport: 'ipc' })
const packagefile = require("../package.json")
const { ipcRenderer  } = require ("electron");
const scdl = require('soundcloud-downloader').default
const { getLyrics, getSong } = require ("genius-lyrics-api")
const fs = require('fs')

const clientVersion = packagefile.version

let userrpcrefreshrate = 1000;
let userappstartuptime = Date.now()
let userlistening = null
let userlisteningcurduration = ""
let userlisteningendduration = ""
let userlisteningsong = ""
let userlisteningcover = ""
let userlisteningartist = ""
let userlisteningdurationtext = ""
let userlisteningliked = ""
let userlisteninglyrics = ""
let usermouseX = 0;
let usermouseY = 0;

let webview = document.querySelector("#webview")
webview.setAttribute("src", settings.startuppage)

DiscordRPC.register(clientId)

async function setDActivity() {
    if (!RPC) return;
    var userdetail;
    var userbigimage;
    var userbigimagetext;
    var usersmallimage;
    var userviewpage = webview.getURL().split("//")[1].split("/")[1]
    if (userviewpage == "you") {userviewpage = "Library"}
    
    if (!userlistening) {
        userdetail = "Exploring SoundCloud"
        userlisteningdurationtext = "At " + userviewpage
        userbigimage = "bw-exploring-bordered-white"
        usersmallimage = "bw-icon-bordered-white"
        userbigimagetext = "Exploring"
    } else {
        userdetail = `Listening To ${userlisteningsong}`
        userlisteningdurationtext = `${userlisteningcurduration} | ${userlisteningendduration}`
        userbigimage = userlisteningcover
        userbigimagetext = "By " + userlisteningartist
        usersmallimage = "bw-icon-bordered-white"
    }    

    RPC.setActivity({
        details: userdetail,
        state: userlisteningdurationtext,
        largeImageKey: userbigimage,
        largeImageText: userbigimagetext,
        smallImageKey: usersmallimage,
        smallImageText: `V${clientVersion}`,
        instance: false,
        buttons: [
            {
                label: "Download",
                url: 'https://bsc.alirezakj.com/',
            },
            {
                label: "Github",
                url: packagefile.repository,
            }
        ]

    })
}

RPC.on('ready', async () => {

    setInterval(() => {
        if (settings.discordrpc == "true") {
            setDActivity();
        }
    }, userrpcrefreshrate);
    
})

// Theme And Plugins State
let darkCloudState = dbResolve("themedarkCloud","off")
let nocturnalState = dbResolve("themenocturnal","off")
let postMorphicState = dbResolve("themepostMorphic","off")
let hoverState = dbResolve("themehover","off")
let adSystemState = dbResolve("pluginAdSystem","silentAds")
let reloadTimeoutState = true

webview.addEventListener('dom-ready', () => {
    RPC.login({ clientId }).catch(err => console.error(err))
    
    addFile(packagefile.plugins.SCI)
    addFile(packagefile.theme.SCI, "css")
    addFile(packagefile.plugins.ctxMenu)
    addFile(packagefile.plugins.discordRPC)

    
    if (darkCloudState == "on") {
        addFile(packagefile.theme.darkCloud, "css")
    }
    if (nocturnalState == "on") {
        addFile(packagefile.theme.nocturnal, "css")
    }
    if (postMorphicState == "on") {
        addFile(packagefile.theme.postMorphic, "css")
    }
    if (hoverState == "on") {
        addFile(packagefile.theme.hover, "css")
    }

    if (adSystemState == "silentAds") {
        addFile(packagefile.plugins.silentAds)
    } else if (adSystemState == "reloadOnAds") {
        addFile(packagefile.plugins.reloadOnAds)
    } else if (adSystemState == "reloadAndPlay") {
        addFile(packagefile.plugins.reloadAndPlayOnAds)
    }

    if (settings.custombg == "true") {
        addFile(packagefile.plugins.custombg)
    }

    if (dbGetItem("customcss") != undefined) {
        insertCSS(dbGetItem("customcss"))
    }
    if (dbGetItem("customjs") != undefined) {
        execJS(dbGetItem("customjs"))
    }

    // webview.openDevTools()

    reloadTimeoutState = true
})


webview.addEventListener('console-message', (e) => {
    if (e.level == 1) {
        let signal = e.message
        signalParts = signal.split("|")
        if (signalParts[0] == "BSCReceive") {
            if (signalParts[1] == "Playing") {
                userlistening = true
            } else if (signalParts[1] == "Paused") {
                userlistening = false
            } else if (signalParts[1] == "CurSongTitle") {
                songname = signalParts[2].split("\n")[0].replace("Current track: ","")
                userlisteningsong = songname                
            } else if (signalParts[1] == "CurSongArtist") {
                userlisteningartist = signalParts[2] 
            } else if (signalParts[1] == "CurrentDur") {
                userlisteningcurduration = signalParts[2] 
            } else if (signalParts[1] == "EndDur") {
                userlisteningendduration = signalParts[2] 
            } else if (signalParts[1] == "CurSongCoverUrl") {
                userlisteningcover = signalParts[2] 
            } else if (signalParts[1] == "CurSongLiked") {
                userlisteningliked = signalParts[2]
            } else if (signalParts[1] == "MouseX") {
                usermouseX = parseInt(signalParts[2])
            } else if (signalParts[1] == "MouseY") {
                usermouseY = parseInt(signalParts[2])
                CTXMenu()
            } else if (signalParts[1] == "MouseClicked") {
                CTXMenu("close")
            } else if (signalParts[1] == "AdIsOn") {
                if (adSystemState == "silentAds") {
                    webview.setAudioMuted(true)
                } else if (adSystemState == "reloadOnAds") {
                    if (reloadTimeoutState) {
                        reloadTimeoutState = false
                        webview.reload()
                    }
                } else if (adSystemState == "reloadAndPlay") {
                    if (reloadTimeoutState) {
                        reloadTimeoutState = false
                        webview.reload()
                    }
                }
            } else if (signalParts[1] == "AdIsOff") {
                if (adSystemState == "silentAds") {
                    webview.setAudioMuted(false)
                }
            } else if (signalParts[1] == "UISettingShowRequest") {
                Settings("show",parseInt(signalParts[2]))
            } else if (signalParts[1] == "UISettingCloseApp") {
                ipcRenderer.send ("appReqClose");
                console.log("app close request sent")
            } else if (signalParts[1] == "UISettingMaximizeApp") {
                ipcRenderer.send ("appReqMaximize");
                console.log("app maximize request sent")
            } else if (signalParts[1] == "UISettingMinimizeApp") {
                ipcRenderer.send ("appReqMinimize");
                console.log("app minimize request sent")
            } else if (signalParts[1] == "UISettingPreviousFrame") {
                webview.goBack()
            } else if (signalParts[1] == "UISettingNextFrame") {
                webview.goForward()
            } else if (signalParts[1] == "UIActivateShowCase") {
                showCase(true)
            } else if (signalParts[1] == "UIActivateLyricShowCase") {
                lyricShowCase(true)
            } 
        }
    }
})


let ctxmenudiv = document.querySelector("#ctxmenu")
// Custom CTXMenu
function CTXMenu(state = "open") {
    var x = usermouseX;
    var y = usermouseY;
    if (state == "open") {
        ctxmenudiv.style.top = y + "px"
        ctxmenudiv.style.left = x + "px"
        ctxmenudiv.classList.add("showmenu")
    } else {
        ctxmenudiv.classList.remove("showmenu")
    }
}


document.addEventListener('contextmenu', function(e) {CTXMenu()})
const moveCursor = (e) => {usermouseX = e.clientX;usermouseY = e.clientY;}

window.addEventListener('mousemove', moveCursor)
window.addEventListener('click', (event) => {CTXMenu("close")});

// View Utils Functions
function execJS(code) {webview.executeJavaScript(code,true)}
function insertCSS(code) {return webview.insertCSS(code)}
function addFile(fileurl,method = "js") {
    var rawFile = new XMLHttpRequest();
    rawFile.open("GET", fileurl, false);
    rawFile.onreadystatechange = function () {
        if (rawFile.readyState === 4) {
            if (rawFile.status === 200 || rawFile.status == 0) {
                var allText = rawFile.responseText;
                if (method == "css") {
                    csstoken = insertCSS(allText)
                    return csstoken
                } else {
                    execJS(allText)
                }
            }
        }
    }
    rawFile.send(null);
}
function copyCurUrl() {navigator.clipboard.writeText(webview.getURL());}
function changeViewUrl(url) {webview.loadURL(url)}

// Settings
let settingsdiv = document.querySelector(".settings")
let settingslidesdiv = document.querySelectorAll(".settings .slide")
let settingsidebars = document.querySelectorAll(".settings .sidebar .item")
function Settings(state = "show",focus = 0) {
    if (state == "show") {
        settingsdiv.style.visibility = "visible"
        settingsdiv.style.display = "inline-block"
        settingsdiv.classList.add("showsettings")
    } else {
        settingsdiv.classList.remove("showsettings")
        settingsdiv.style.display = "none"
        setTimeout(() => {settingsdiv.style.visibility = "hidden"}, 200);
    }
    focusSettingSlide(focus)
}
function focusSettingSlide(slidenum) {
    var slide = settingslidesdiv[slidenum]
    var sidebar = settingsidebars[slidenum]
    if (sidebar.classList.contains("activesidebar")) {
        slide.classList.remove("activeslide")
        setTimeout(() => {slide.style.display = "none"}, 250);
        sidebar.classList.remove("activesidebar")
    } else {
        settingslidesdiv.forEach(el => {
            el.classList.remove("activeslide")
            setTimeout(() => {el.style.display = "none"}, 250);
        });
        setTimeout(() => {slide.style.display = "inline-block"}, 500);
        setTimeout(() => {slide.classList.add("activeslide")}, 750);
        settingsidebars.forEach(el => {
            el.classList.remove("activesidebar")
        })
        sidebar.classList.add("activesidebar")
    }

}

// Handle Escape Key close action in diffrent ui parts
ipcRenderer.on("appReqEsc", function (evt, message) {
    if (document.querySelector(".settings").classList.contains("showsettings")) {
        Settings("exit")            
    } else if (document.querySelector(".songshowcase").classList.contains("songshowcase_on")) {
        showCase(false)
    } else if (document.querySelector(".songlyricshowcase").classList.contains("songlyricshowcase_on")) {
        lyricShowCase(false)
    }
})

// Theme Handler
let darkcloudtgl = document.getElementById("darkcloudtgl")
let darkclouddiv = document.querySelector(".darkcloud")
let nocturnaltgl = document.getElementById("nocturnaltgl")
let nocturnaldiv = document.querySelector(".nocturnal")
let postMorphictgl = document.getElementById("postMorphictgl")
let postMorphicdiv = document.querySelector(".postMorphic")
let hovertgl = document.getElementById("hovertgl")
let hoverdiv = document.querySelector(".hover")

if (darkCloudState == "on") {
    darkcloudtgl.classList.add("tglon")
    darkcloudtgl.innerText = "ON"
    darkclouddiv.setAttribute("onclick","switchTheme('darkCloud','off')")
} else {
    darkcloudtgl.innerText = "OFF"
    darkclouddiv.setAttribute("onclick","switchTheme('darkCloud','on')")
}
if (nocturnalState == "on") {
    nocturnaltgl.classList.add("tglon")
    nocturnaltgl.innerText = "ON"
    nocturnaldiv.setAttribute("onclick","switchTheme('nocturnal','off')")
} else {
    nocturnaltgl.innerText = "OFF"
    nocturnaldiv.setAttribute("onclick","switchTheme('nocturnal','on')")
}
if (postMorphicState == "on") {
    postMorphictgl.classList.add("tglon")
    postMorphictgl.innerText = "ON"
    postMorphicdiv.setAttribute("onclick","switchTheme('postMorphic','off')")
} else {
    postMorphictgl.innerText = "OFF"
    postMorphicdiv.setAttribute("onclick","switchTheme('postMorphic','on')")
}
if (hoverState == "on") {
    hovertgl.classList.add("tglon")
    hovertgl.innerText = "ON"
    hoverdiv.setAttribute("onclick","switchTheme('hover','off')")
} else {
    hovertgl.innerText = "OFF"
    hoverdiv.setAttribute("onclick","switchTheme('hover','on')")
}


function switchTheme(theme,state = "on") {
    if (state == "on") {
        if (theme == "darkCloud") {
            darkCloudState = "on"
            dbSetItem("themedarkCloud","on")
            darkcloudtgl.classList.add("tglon")
            darkcloudtgl.innerText = "ON"
            darkclouddiv.setAttribute("onclick","switchTheme('darkCloud','off')")
            addFile(packagefile.theme.darkCloud, "css")
        } else if (theme == "nocturnal") {
            nocturnalState = "on"
            dbSetItem("themenocturnal","on")
            nocturnaltgl.classList.add("tglon")
            nocturnaltgl.innerText = "ON"
            nocturnaldiv.setAttribute("onclick","switchTheme('nocturnal','off')")
            addFile(packagefile.theme.nocturnal, "css")
        } else if (theme == "postMorphic") {
            postMorphicState = "on"
            dbSetItem("themepostMorphic","on")
            postMorphictgl.classList.add("tglon")
            postMorphictgl.innerText = "ON"
            postMorphicdiv.setAttribute("onclick","switchTheme('postMorphic','off')")
            addFile(packagefile.theme.postMorphic, "css")
        } else if (theme == "hover") {
            hoverState = "on"
            dbSetItem("themehover","on")
            hovertgl.classList.add("tglon")
            hovertgl.innerText = "ON"
            hoverdiv.setAttribute("onclick","switchTheme('hover','off')")
            addFile(packagefile.theme.hover, "css")
        }
    } else {
        if (theme == "darkCloud") {
            darkCloudState = "off"
            dbSetItem("themedarkCloud","off")
            darkcloudtgl.classList.remove("tglon")
            darkcloudtgl.innerText = "OFF"
            darkclouddiv.setAttribute("onclick","switchTheme('darkCloud','on')")
            webview.reload()
        } else if (theme == "nocturnal") {
            nocturnalState = "off"
            dbSetItem("themenocturnal","off")
            nocturnaltgl.classList.remove("tglon")
            nocturnaltgl.innerText = "OFF"
            nocturnaldiv.setAttribute("onclick","switchTheme('nocturnal','on')")
            webview.reload()
        } else if (theme == "postMorphic") {
            postMorphicState = "off"
            dbSetItem("themepostMorphic","off")
            postMorphictgl.classList.remove("tglon")
            postMorphictgl.innerText = "OFF"
            postMorphicdiv.setAttribute("onclick","switchTheme('postMorphic','on')")
            webview.reload()
        } else if (theme == "hover") {
            hoverState = "off"
            dbSetItem("themehover","off")
            hovertgl.classList.remove("tglon")
            hovertgl.innerText = "OFF"
            hoverdiv.setAttribute("onclick","switchTheme('hover','on')")
            webview.reload()
        }
    }
}

// Plugins Handling
let adSystemDivs = document.querySelectorAll(".options .option")
if (adSystemState == "default") {adSystemDivs[0].classList.add("active")
} else if (adSystemState == "silentAds") {adSystemDivs[1].classList.add("active")
} else if (adSystemState == "reloadOnAds") {adSystemDivs[2].classList.add("active")
} else if (adSystemState == "reloadAndPlay") {adSystemDivs[3].classList.add("active")}

function switchPlugin(plugin,state) {
    if (plugin == "adSystem") {
        adSystemDivs.forEach(element => {
            element.classList.remove("active")
        });
        if (state == "default") {
            adSystemDivs[0].classList.add("active")
            adSystemState = "default"
            dbSetItem("pluginAdSystem","default")
        } else if (state == "silentAds") {
            adSystemDivs[1].classList.add("active")
            adSystemState = "silentAds"
            dbSetItem("pluginAdSystem","silentAds")
        } else if (state == "reloadOnAds") {
            adSystemDivs[2].classList.add("active")
            adSystemState = "reloadOnAds"
            dbSetItem("pluginAdSystem","reloadOnAds")
        } else if (state == "reloadAndPlay") {
            adSystemDivs[3].classList.add("active")
            adSystemState = "reloadAndPlay"
            dbSetItem("pluginAdSystem","reloadAndPlay")
        } 
    }
    webview.reload()
}

// Custom CSS and JS handling 
let customcssbox = document.querySelector("#customcssbox")
let customjsbox = document.querySelector("#customjsbox")

let customcsseditor = ace.edit("customcssbox");
let customcssvalue = dbGetItem("customcss")
if (customcssvalue == undefined) {customcssvalue = "/* Make sure to use !important if your style doesn't applied */\n/* Dont do anything if you dont know anything ;) */"}
customcsseditor.setTheme("ace/theme/monokai");
customcsseditor.session.setMode("ace/mode/css");
customcsseditor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true,
    value: customcssvalue
});

let customjseditor = ace.edit("customjsbox");
let customjsvalue = dbGetItem("customjs")
if (customjsvalue == undefined) {customjsvalue = "// Dont do anything if you dont know anything ;)"}
customjseditor.setTheme("ace/theme/monokai");
customjseditor.session.setMode("ace/mode/javascript");
customjseditor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: true,
    enableLiveAutocompletion: true,
    value: customjsvalue
});

function applyCustomCSS() {
    var customcss = customcsseditor.getValue()
    dbSetItem("customcss", customcss)
    webview.reload()
}

function applyCustomJS() {
    var customjs = customjseditor.getValue()
    dbSetItem("customjs",customjs)
    webview.reload()
}

// Go To Url Functions
let gotopanel = document.querySelector("#gotopanel")
let gotourltextbox = document.querySelector("#gotourltextbox")

async function gotoUI(state = "open") {
    if (state == "open")  {
        gotopanel.classList.add("gotopanelon")
        
    } else if (state == "toggle") {
        gotopanel.classList.toggle("gotopanelon")
    } else {
        gotopanel.classList.remove("gotopanelon")
    }
    clipboardcontent = await navigator.clipboard.readText();
    gotourltextbox.value = clipboardcontent
}

function gotoReqUi() {
    var gotourl = gotourltextbox.value
    if (gotourl.includes("soundcloud")) {
        if (gotourl.includes("https://")) {
            // Pass
        } else if (gotourl.includes("http://")) {
            // Pass
        } else {
            gotourl = "https://" + gotourl
        }
        webview.loadURL(gotourl)
        gotoUI("close")
    } else {
        alert("Not A SoundCloud URL")
        gotoUI("close")
    }
}

// Handle SCI icons state
ipcRenderer.on('appReqJustFullscreenUIFIX', function (evt, message) {
    setTimeout(() => {
        execJS("toggleMenuIcons()")
    }, 5000);
});

// Handle Genius API Related Functions
const bscgeniusapikey = "j0E8oEgg4dnCbRssY9PV-i0-CB7v9wOkzQhGRTwBTFhdWMffDF_xRXpfKA8EERBl"

function geniusGetLyrics(title, artist) {
    var geniusoptions = {
        apiKey: bscgeniusapikey,
        title: title,
        artist: artist,
        optimizeQuery: true
    };
    getLyrics(geniusoptions).then((lyrics) => {
        console.log(lyrics)
    });
}

function geniusGetSong(title, artist) {
    var geniusoptions = {
        apiKey: bscgeniusapikey,
        title: title,
        artist: artist,
        optimizeQuery: true
    };
    getSong(geniusoptions).then((song) =>
        console.log(song)
    );

}

// Song Show Case
let showcasediv = document.querySelector(".songshowcase")
let showcasetrackname = document.querySelector(".insidecase main .info .trackname")
let showcasetrackartist = document.querySelector(".insidecase main .info .trackartist")
let showcasetrackcur = document.querySelector(".insidecase main .time .trackcur")
let showcasetrackend = document.querySelector(".insidecase main .time .trackend")
let showcasenavplay = document.querySelector(".songshowcase nav .tglplayshowcasebtn")
let showcasenavlike = document.querySelector(".songshowcase nav .tgllikeshowcasebtn")
let showcaseprogbar = document.querySelector(".songshowcase .progbar .fillingbar")

function showCase(open = true) {
    if (open) {
        showcasediv.classList.add("songshowcase_on")
    } else {
        showcasediv.classList.remove("songshowcase_on")
    }
}

// Update The Showcase Details Every Half Second
setInterval(() => {
    showcasediv.style.backgroundImage = `url(${userlisteningcover})`
    showcasetrackname.innerHTML = userlisteningsong
    showcasetrackartist.innerHTML = userlisteningartist
    showcasetrackcur.innerHTML = userlisteningcurduration
    showcasetrackend.innerHTML = userlisteningendduration
    var currentdurinsec = userlisteningcurduration.split(":")
    currentdurinsec = parseInt(currentdurinsec[0]) * 60 + parseInt(currentdurinsec[1])
    var endingdurinsec = userlisteningendduration.split(":")
    endingdurinsec = parseInt(endingdurinsec[0]) * 60 + parseInt(endingdurinsec[1]) 
    showcasetrackplayedpercent = currentdurinsec * 100 / endingdurinsec
    showcaseprogbar.style.width = showcasetrackplayedpercent + "%"

    if (userlistening) {showcasenavplay.classList.remove("tglplayshowcasebtnpaused")
    } else {showcasenavplay.classList.add("tglplayshowcasebtnpaused")}

    if (userlisteningliked == "true") {showcasenavlike.classList.add("tgllikeshowcasebtnliked")
    } else {showcasenavlike.classList.remove("tgllikeshowcasebtnliked")}

}, 500);

function showCaseAction(action) {
    if (action == "play") {
        execJS(`
        var playbtn = document.querySelector(".playControls__elements .playControl")
        playbtn.click()`)

    } else if (action == "skip") {
        execJS(`
        var skipbtn = document.querySelector(".playControls__elements .skipControl__next")
        skipbtn.click()`)
        
    } else if (action == "like") {
        execJS(`
        var likebtn = document.querySelector(".playbackSoundBadge__actions .playbackSoundBadge__like")
        likebtn.click()`)
    } 
}

// Lyric Show Case
let lyricshowcasediv = document.querySelector(".songlyricshowcase")
let lyricshowcasedivblurrer = document.querySelector(".songlyricshowcase .blurrer")
let lyricshowcasebox = document.querySelector(".songlyricshowcase .lyricbox")

function lyricShowCase(open = true) {
    if (open) {
        lyricShowCaseUpdate()
        lyricshowcasediv.classList.add("songlyricshowcase_on")
    } else {
        lyricshowcasediv.classList.remove("songlyricshowcase_on")
    }
}

function lyricShowCaseUpdate() {
    console.log("lyric showcase updated")
    lyricshowcasedivblurrer.style.backgroundImage = `url(${userlisteningcover})`
    let lyricsearchtitle;
    let lyricsearchartist;
    if (userlisteningsong.split("-").length > 1) {
        console.log("found artist in title so replacing")
        lyricsearchtitle = userlisteningsong.split("-")[0]
        lyricsearchartist = userlisteningsong.split("-")[1]
    } else {
        lyricsearchtitle = userlisteningsong
        lyricsearchartist = userlisteningartist    
    }
    
    var geniusoptions = {
        apiKey: bscgeniusapikey,
        title: lyricsearchtitle,
        artist: lyricsearchartist,
        optimizeQuery: true
    };
    getLyrics(geniusoptions).then((lyrics) => {
        console.log(lyrics)
        userlisteninglyrics = lyrics
        let lyricalignmentrtl = false
        if (lyrics.includes("ا")) {
            lyricalignmentrtl = true
        }
        if (userlisteninglyrics == null) {
            lyricshowcasebox.innerHTML = `<span class="lyricbar">Lyrics Not Found</span><br>`
        } else {
            lyricshowcasebox.innerHTML = ""
            userlisteninglyrics = lyrics.split("\n")
            userlisteninglyrics.forEach(element => {
                lyricshowcasebox.innerHTML += `<span class="lyricbar">${element}</span><br>`
            });
            if (lyricalignmentrtl) {
                lyricshowcasebox.classList.add("lyricboxrtl")
            } else {
                lyricshowcasebox.classList.remove("lyricboxrtl")
            }
        }
        lyricshowcasebox.innerHTML += `<span class="lyricbar">Exprimental Feature | Genius API</span><br>`
    });
}


// Handling for  cntrl + r and f5
ipcRenderer.on("appReqCntrlR", function (evt, message) {
    if (settings.bindcntrlr === "viewreload") {
        webview.reload()
    } else if (settings.bindcntrlr === "appreload") {
        ipcRenderer.send ("appReqRestartWindow");
    } else if (settings.bindcntrlr === "disabled") {
        console.log("Control + R is disabled")
    }
})
ipcRenderer.on("appReqF5", function (evt, message) {
    console.log("renderer received f5 req")
    if (settings.bindf5 === "viewreload") {
        webview.reload()
    } else if (settings.bindf5 === "appreload") {
        ipcRenderer.send ("appReqRestartWindow");
    } else if (settings.bindf5 === "disabled") {
        console.log("F5 is disabled")
    }
})

// handle Soundcloud downloader UI buttons
function downloadreq() {
    var downloadurl = document.querySelector("#soundclouddownloaderurlbar").value
    downloadSC(downloadurl)
}


// SCDL API Related Functions
function downloadSC(url) {
    songtitle = "audio"
    let tooltip = document.querySelector("#scdldownloadstatus")
    scdl.getInfo(url).then(info => {
        songtitle = info.title
        console.log(songtitle)
        tooltip.innerHTML = "Started Downloading " + songtitle
        scdl.download(url).then(stream => {
            stream.pipe(fs.createWriteStream(`C://BetterSoundCloud/Downloads/${songtitle}.mp3`))
            tooltip.innerHTML = `Saved to C://BetterSoundCloud/Downloads/${songtitle}.mp3`
            ipcRenderer.send("appDownloaderFinish");
        })
    })
    
}

if (!fs.existsSync("C://BetterSoundCloud")) {
    fs.mkdirSync("C://BetterSoundCloud")
}
if (!fs.existsSync("C://BetterSoundCloud/Downloads")) {
    fs.mkdirSync("C://BetterSoundCloud/Downloads")
}