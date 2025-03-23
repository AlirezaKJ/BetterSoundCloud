let tick = 0

let songinfostate;
let songinfocurrentdur;
let songinfoenddur;
let songinfocursongtitle;
let songinfocursongcoverurl;
let songinfoartist;

setInterval(() => {
    var playbtn = document.querySelector(".playControls__elements .playControl")
    var endduration = document.querySelectorAll(".playbackTimeline__duration span")[1]
    var currentduration = document.querySelectorAll(".playbackTimeline__timePassed span")[1]
    var currentsongtitle = document.querySelector(".playbackSoundBadge__title")
    var currentsongcover = document.querySelector(".playControls__soundBadge .image__lightOutline span").getAttribute("style").split(";")[0].split('"')[1].replace("120x120","500x500")
    var currentsongurl = document.querySelector(".playbackSoundBadge__titleLink").getAttribute("href")
    // currentsongcover = currentsongcover
    var currentartist = document.querySelector(".playbackSoundBadge__lightLink")
    var currentsongliked = document.querySelector(".playbackSoundBadge__actions .playbackSoundBadge__like")
    if (currentsongliked.getAttribute("title") == "Unlike") {
        currentsongliked = true
    } else {
        currentsongliked = false
    }
    
    tick = tick + 1
    songinfocurrentdur = currentduration.innerText
    songinfoenddur = endduration.innerText
    songinfocursongtitle = currentsongtitle.innerText.split("\n")[1]
    songinfocursongcoverurl = currentsongcover
    songinfoartist = currentartist.innerText
    if (playbtn.classList.contains("playing")) {
        songinfostate = "playing"
        console.log("BSCReceive|Playing")
    } else {
        songinfostate = "paused"
        console.log("BSCReceive|Paused")
    }
    console.log("BSCReceive|CurSongTitle|" + currentsongtitle.innerText.split("\n")[1])
    console.log("BSCReceive|CurrentDur|" + currentduration.innerText)
    console.log("BSCReceive|EndDur|" + endduration.innerText)
    console.log("BSCReceive|CurSongCoverUrl|" + currentsongcover)
    console.log("BSCReceive|CurSongArtist|" + currentartist.innerText)
    console.log("BSCReceive|CurSongLiked|" + currentsongliked)
    console.log("BSCReceive|CurSongUrl|" + currentsongurl)
    console.log("tick number ",tick)

},1000)