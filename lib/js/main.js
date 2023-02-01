const DiscordRPC = require('discord-rpc')
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
        startTimestamp: userappstartuptime,
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
    setDActivity();

    setInterval(() => {
        setDActivity();
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
    
    addFile(packagefile.plugins.ctxMenu)
    addFile(packagefile.plugins.discordRPC)
    addFile(packagefile.plugins.SCI)
    addFile(packagefile.theme.SCI, "css")

    
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
        setTimeout(() => {slide.style.display = "inline-block"}, 500);
        setTimeout(() => {slide.classList.add("activeslide")}, 750);
        settingsidebars.forEach(el => {
            el.classList.remove("activesidebar")
        })
        sidebar.classList.add("activesidebar")
    }

}

document.body.addEventListener('keyup', function(e) {
        if (e.key == "Escape") {
            Settings("exit")            
        }
    }
)

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

// Go To Url Functions
let gotopanel = document.querySelector("#gotopanel")
let gotourltextbox = document.querySelector("#gotourltextbox")

function gotoUI(state = "open") {
    if (state == "open")  {
        gotopanel.classList.add("gotopanelon")
    } else if (state == "toggle") {
        gotopanel.classList.toggle("gotopanelon")
    } else {
        gotopanel.classList.remove("gotopanelon")
    }
}

function gotoReqUi() {
    var gotourl = gotourltextbox.value
    if (gotourl.includes("soundcloud")) {
        webview.loadURL(gotourl)
        gotoUI("close")
    } else {
        alert("Not A SoundCloud URL")
        gotoUI("close")
    }
}