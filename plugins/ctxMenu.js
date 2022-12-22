let usermouseX = 0;
let usermouseY = 0;
const moveCursor = (e) => {
    usermouseX = e.clientX;
    usermouseY = e.clientY;
    // console.log(usermouseX,usermouseY)
}

window.addEventListener('mousemove', moveCursor)
window.addEventListener('click', (event) => {mouseClick()});

function mouseClick() {
    console.log("BSCReceive|MouseClicked")
}

function requestUrl() {console.log("BSCReceive|CurUrlReq")}


document.addEventListener('contextmenu', function(e) {
        console.log(`BSCReceive|MouseX|${usermouseX}`)
        console.log(`BSCReceive|MouseY|${usermouseY}`)
        e.preventDefault();
});