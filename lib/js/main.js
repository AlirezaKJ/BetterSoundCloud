const DiscordRPC = require('discord-rpc')
const fs = require('fs')
const clientId = "1054636117284106270"
const RPC = new DiscordRPC.Client({ transport: 'ipc' })
const packagefile = require("../package.json")

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
let usermouseX = 0;
let usermouseY = 0;

let webview = document.querySelector("#webview")

DiscordRPC.register(clientId)

async function setDActivity() {
    if (!RPC) return;

    var userdetail;
    var usersmallimage;
    
    if (!userlistening) {
        userdetail = "Exploring SoundCloud"
        userlisteningdurationtext = "00:00 | 00:00"
        usersmallimage = "sc-play"
    } else {
        userdetail = `Listening To ${userlisteningsong}`
        userlisteningdurationtext = `${userlisteningcurduration} | ${userlisteningendduration}`
        usersmallimage = userlisteningcover
    }
    

    RPC.setActivity({
        details: userdetail,
        state: userlisteningdurationtext,
        startTimestamp: userappstartuptime,
        largeImageKey: "bw-icon-bordered",
        largeImageText: "Better Sound Cloud",
        smallImageKey: usersmallimage,
        smallImageText: `V${clientVersion}`,
        instance: false,
        buttons: [
            {
                label: "Download",
                url: packagefile.downloadpage,
            },
            {
                label: "Github",
                url: packagefile.repository,
            }
        ]

    })
}

RPC.on('ready', async () => {
    setDActivity();

    setInterval(() => {
        setDActivity();
    }, userrpcrefreshrate);
})
RPC.login({ clientId }).catch(err => console.error(err))



webview.addEventListener('dom-ready', () => {
    addFile(packagefile.plugins.ctxMenu)
    addFile(packagefile.plugins.discordRPC)
    // webview.openDevTools()
})



webview.addEventListener('console-message', (e) => {
    if (e.level == 1) {
        let signal = e.message
        // console.log(signal)
        signalParts = signal.split("|")
        if (signalParts[0] == "BSCReceive") {
            if (signalParts[1] == "Playing") {
                userlistening = true
            } else if (signalParts[1] == "Paused") {
                userlistening = false
            } else if (signalParts[1] == "CurSongTitle") {
                songname = signalParts[2]
                songname = songname.split("\n")
                userlisteningsong = songname[1]
            } else if (signalParts[1] == "CurrentDur") {
                userlisteningcurduration = signalParts[2] 
            } else if (signalParts[1] == "EndDur") {
                userlisteningendduration = signalParts[2] 
            } else if (signalParts[1] == "CurSongCoverUrl") {
                userlisteningcover = signalParts[2] 
            } else if (signalParts[1] == "MouseX") {
                usermouseX = parseInt(signalParts[2])
            } else if (signalParts[1] == "MouseY") {
                usermouseY = parseInt(signalParts[2])
                CTXMenu()
            } else if (signalParts[1] == "MouseClicked") {
                CTXMenu("close")
            }
        }
    }
    // webview.openDevTools()
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



document.addEventListener('contextmenu', function(e) {
    CTXMenu()
    e.preventDefault();
});

const moveCursor = (e) => {
    usermouseX = e.clientX;
    usermouseY = e.clientY;
    // console.log(usermouseX,usermouseY)
}

window.addEventListener('mousemove', moveCursor)
window.addEventListener('click', (event) => {CTXMenu("close")});
addEventListener('click', (event) => {CTXMenu("close")});

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
                // alert(allText);
                if (method == "css") {
                    return insertCSS(allText)
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
        settingsdiv.classList.add("showsettings")
    } else {
        settingsdiv.classList.remove("showsettings")
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
        // slide.classList.add("activeslide")
        setTimeout(() => {slide.style.display = "inline-block"}, 500);
        setTimeout(() => {slide.classList.add("activeslide")}, 750);
        settingsidebars.forEach(el => {
            el.classList.remove("activesidebar")
        })
        sidebar.classList.add("activesidebar")
    }

}