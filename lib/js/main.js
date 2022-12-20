const DiscordRPC = require('discord-rpc')
const fs = require('fs')
const clientId = "1054636117284106270"
const RPC = new DiscordRPC.Client({ transport: 'ipc' })
const packagefile = require("../package.json")

const clientVersion = packagefile.version

let userappstartuptime = Date.now()
let userrpcrefreshrate = 1000;
let userlistening = null
let userlisteningcurduration = ""
let userlisteningendduration = ""
let userlisteningsong = ""
let userlisteningartist = ""
let userlisteningdurationtext = ""

DiscordRPC.register(clientId)

async function setDActivity() {
    if (!RPC) return;

    var userdetail;
    
    if (!userlistening) {
        userdetail = "Exploring SoundCloud"
        userlisteningdurationtext = "00:00 | 00:00"
    } else {
        userdetail = `Listening To ${userlisteningsong}`
        userlisteningdurationtext = `${userlisteningcurduration} | ${userlisteningendduration}`
    }
    
    RPC.setActivity({
        details: userdetail,
        state: userlisteningdurationtext,
        startTimestamp: userappstartuptime,
        largeImageKey: "bw-icon-bordered",
        largeImageText: "Better Sound Cloud",
        smallImageKey: "sc-play",
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


let webview = document.querySelector("#webview")

webview.addEventListener('dom-ready', () => {
    execJS(rpcReceiver)
    console.log("view loaded")
    // webview.openDevTools()
})

webview.addEventListener('console-message', (e) => {
    if (e.level == 1) {
        let signal = e.message
        signalParts = signal.split("|")
        if (signalParts[0] == "BSCReceive") {
            if (signalParts[1] == "Playing") {
                userlistening = true
            }
            if (signalParts[1] == "Paused") {
                userlistening = false
            }
            if (signalParts[1] == "CurSongTitle") {
                songname = signalParts[2]
                songname = songname.split("\n")
                userlisteningsong = songname[1]
            }
            if (signalParts[1] == "CurrentDur") {
                userlisteningcurduration = signalParts[2] 
            }
            if (signalParts[1] == "EndDur") {
                userlisteningendduration = signalParts[2] 
            }
        }
    }
    // webview.openDevTools()
})

function execJS(code) {webview.executeJavaScript(code,true)}
function insertCSS(code) {return webview.insertCSS(code)}

function addFile(filepath,method = "js") {
    // var filecontent
    fs.readFile(filepath, (err, data) => {
        if (err) {
            console.error('Error ',err);
        }
        filecontent = data.toString()
        console.log(filecontent)
        if (method == "css") {
            return insertCSS(filecontent)
        } else {
            execJS(filecontent)
        }
    });
}