let latestversion = "0.2.0"
let currentversion = clientVersion
let patchnotesdiv = document.getElementById("changenote")

let patchnotes = [
    {
        "title":"V0.3.0 (Beta)",
        "changes":[
            "- Added Nocturnal Theme By <a href='https://userstyles.org/styles/129712/nocturnal-soundcloud-theme'>Chloe Chantelle</a>",
            "- Added Post Morphic Theme By <a href='https://userstyles.org/styles/253043/post-morphic-soundcloud'>kantraa</a>",
            "- Added Hover Theme By <a href='https://userstyles.org/styles/216317/soundcloud-hover-theme'>TomDom</a>",
            "- Added Update Checking System",
            "- Added Automatic Patchnotes From CDN",
            "- Added Links To Each Patch Box",
            "- App Dont Automatically Start On Fullscreen Anymore",
        ],
        "date":"28 January 2023",
        "link":"#"
    },
    {
        "title":"V0.2.0 (Beta)",
        "changes":[
            "- Added Themes Menu",
            "- Added Dark Cloud Theme",
            "- Added Plugins Menu",
            "- Added SilentAd Plugin",
            "- Added ReloadOnAd Plugin",
            "- Added ReloadAndPlay Plugin",
            "- Added Database Features To Save Settings And Prefrences",
            "- Fixed Discord RPC To Show The Big Image Of The Song And Diffrent States"
        ],
        "date":"6 January 2023",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.2.0"
    },
    {
        "title":"V0.1.1 (Beta)",
        "changes":[
            "- Right Click Menu Added",
            "- Option Menu Added",
            "- Song Cover Added To DiscordRPC",
        ],
        "date":"23 December 2022",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V.0.1.1"
    },
    {
        "title":"V0.1.0 (Beta)",
        "changes":[
            "- Added Discord Rich Presence",
            "- Main And First Release"
        ],
        "date":"21 December 2022",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V.0.1.0"
    },
]

// Update Version Infos
let currentversionel = document.getElementById("currentversion")
currentversionel.innerHTML = currentversion
let latestversionel = document.getElementById("latestversion")
if (currentversion === latestversion) {
    latestversionel.innerHTML = "You Are On The Latest Version"
} else {
    latestversionel.innerHTML = "New Update Is Available"
}
// Add Patch Note Divs
let dividinghr = document.createElement("hr")
patchnotesdiv.appendChild(dividinghr)
for (let index = 0; index < patchnotes.length; index++) {
    const patch = patchnotes[index];
    let notediv = document.createElement("div")
    notediv.classList.add("note")
    let notetitle = document.createElement("h3")
    notetitle.innerHTML = patch.title
    notediv.appendChild(notetitle)
    for (let index = 0; index < patch.changes.length; index++) {
        const changenote = patch.changes[index];
        let changenoteel = document.createElement("p")
        changenoteel.innerHTML = changenote
        notediv.appendChild(changenoteel)
    }
    let notedate = document.createElement("span")
    notedate.classList.add("date")
    notedate.innerHTML = "21 December 2022"
    notediv.appendChild(notedate)
    let linkel = document.createElement("a")
    linkel.setAttribute("href",patch.link)
    linkel.setAttribute("target","_blank")
    linkel.appendChild(notediv)
    patchnotesdiv.appendChild(linkel)
    let dividinghr = document.createElement("hr")
    patchnotesdiv.appendChild(dividinghr)
}