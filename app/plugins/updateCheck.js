let latestversion = "0.5.3"
let currentversion = clientVersion
let patchnotesdiv = document.getElementById("changenote")

let patchnotes = [
    {
        "title":"V0.5.3 (Beta)",
        "changes":[
            "- Added deeplinks, load any url with bsc://",
            "- Added native MediaKeys integration (play, next, previous)",
            "- Added Tray menu",
			"- Fixed header icons scrollbar bug in high zoom",
			"- Fixed the lyric page to auto refresh on new song",
			"- New feature: auto scroll down button for lazy loading",
			"- New setting option: overall zoom factor",
			"- New setting option: on startup load last page",
			"- Several settings page tweaks and ui fixes"
        ],
        "date":"12 March 2024",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.3"
    },
    {
        "title":"V0.5.2 (Beta)",
        "changes":[
            "- Added lyric showcase feature (Super Experimental)",
			"- Added custom background feature to replace the unused background of soundcloud",
			"- Added basic tooltip to each setting options",
			"- From now when you download a song using the downloader the folder will automatically open",
			"- Replaced the header bar buttons with icons instead of text (SCI)",
            "- Replaced all UI scrollbars same as the SCI scrollbar",
            "- Improved the song showcase animations",
			"- Improved Esc keypress functionality",
			"- New setting option: handle Cntrl + R",
			"- New setting option: handle F5",
			"- New setting option: turn custombg on and off",
			"- New setting option: turn discordrpc on and off",
			"- New setting option: clear the whole application cache and data",
			"- New setting option: go to soundcloud settings page from bsc settings",
			"- No more errors on creating the bettersoundcloud root folder",
			"- Removed for artist button recently added to soundcloud header",
        ],
        "date":"13 May 2023",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.2"
    },    
    {
        "title":"V0.5.1 (Beta)",
        "changes":[
            "- Added soundcloud downloader in plugins tab",
            "- added custom css and js editor",
            "- added settings menu to customize the app experience",
        ],
        "date":"9 April 2023",
        "link":"https://github.com/AlirezaKJ/BetterSoundCloud/releases/tag/V0.5.1   "
    },
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