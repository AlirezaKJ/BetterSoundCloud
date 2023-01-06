let tick = 0

setInterval(() => {
    var playbtn = document.querySelector(".playControls__elements .playControl")
    var endduration = document.querySelectorAll(".playbackTimeline__duration span")[1]
    var currentduration = document.querySelectorAll(".playbackTimeline__timePassed span")[1]
    var currentsongtitle = document.querySelector(".playbackSoundBadge__title")
    var currentsongcover = document.querySelector(".playControls__soundBadge .image__lightOutline span").getAttribute("style").split(";")[0].split('"')[1].replace("120x120","500x500")
    // currentsongcover = currentsongcover
    var currentartist = document.querySelector(".playbackSoundBadge__lightLink")
    
    tick = tick + 1
    if (playbtn.classList.contains("playing")) {
        console.log("BSCReceive|Playing")
        console.log("BSCReceive|CurrentDur|" + currentduration.innerText)
        console.log("BSCReceive|EndDur|" + endduration.innerText)
        console.log("BSCReceive|CurSongTitle|" + currentsongtitle.innerText )
        console.log("BSCReceive|CurSongCoverUrl|" + currentsongcover)
        console.log("BSCReceive|CurSongArtist|" + currentartist.innerText)
    } else {console.log("BSCReceive|Paused")}
    console.log("tick number ",tick)

},100)