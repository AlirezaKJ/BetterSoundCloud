let latestversion = "0.4.0"
let currentversion = clientVersion
let patchnotesdiv = document.getElementById("changenote")

let patchnotes = [
    {
        "title":"V0.5.0 (Beta)",
        "changes":[
            "- SCI Feature: added a custom minimize, maximize and close button to main soundcloud header frame",
            "- SCI Feature: added song showcase feature and the button of it to down right",
            "- SCI Feature: removed upload, notification, tripledot and messages button from main soundcloud header frame (as they were useless)",
            "- SCI Feature: added a custom go back and forward button to main soundcloud header frame",
            "- app will start on fullscreen (custom buttons will help you to get out of it)",
            "- removed discord rpc start timestamp as it was useless and no point on it",
            "From now everytime the app start caches clear to update any theme and plugin changes (including update checker)",
            "this may result in a high load time but a auto plugin and themes latest fetching",
        ],
        "date":"21 February 2023",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.0"
    },
    {
        "title":"V0.4.0 (Beta)",
        "changes":[
            "- Added SCI (SoundCloudImprovement) Theme And Plugin By <a href='https://github.com/AlirezaKJ'>AlirezaKJ</a>",
            "- SCI Feature: Removed Try GO+ And Try Next Pro (ADs) Buttons ",
            "- SCI Feature: Removed All Products And Discounts (ADs) Banners",
            "- SCI Feature: Added Theme And Plugins Setting Button To Play Controls Bar",
            "- SCI Feature: Replaced Default Browser Scrollbar",
            "- Added Go To Url Option To Right Click Menu",
            "- Updated DiscordRPC Download Link To <a href='https://bsc.alirezakj.com'>This</a>",
            "- Updated Plugin Retrieving From raw.githubusercontent.com To jsdelivr.com For A Better Load",
            "- Created A Custom Page For BetterSoundCloud At: <a href='https://bsc.alirezakj.com'>bsc.alirezakj.com</a>",
        ],
        "date":"3 February 2023",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.4.0"
    },
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
        "date":"26 January 2023",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.3.0"
    },
    {
        "title":"V0.2.0 (Beta)",
        "changes":[
            "- Added Themes Menu",
            "- Added Dark Cloud Theme By <a href='https://github.com/AlirezaKJ'>AlirezaKJ</a>",
            "- Added Plugins Menu",
            "- Added SilentAd Plugin By <a href='https://github.com/AlirezaKJ'>AlirezaKJ</a>",
            "- Added ReloadOnAd Plugin By <a href='https://github.com/AlirezaKJ'>AlirezaKJ</a>",
            "- Added ReloadAndPlay Plugin By <a href='https://github.com/AlirezaKJ'>AlirezaKJ</a>",
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
currentversionel.innerHTML = "V" + currentversion
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
    notedate.innerHTML = patch.date
    notediv.appendChild(notedate)
    let linkel = document.createElement("a")
    linkel.setAttribute("href",patch.link)
    linkel.setAttribute("target","_blank")
    linkel.appendChild(notediv)
    patchnotesdiv.appendChild(linkel)
    let dividinghr = document.createElement("hr")
    patchnotesdiv.appendChild(dividinghr)
}