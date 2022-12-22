let usermouseX = 0
let usermouseY = 0

const moveCursor = (e) => {
    usermouseX = e.clientX;
    usermouseY = e.clientY;
    // console.log(usermouseX,usermouseY)
}

window.addEventListener('mousemove', moveCursor)

// let ctxmenudiv = document.createElement("div")
// ctxmenudiv.innerHTML = "<div class='menuitem' onclick='requestUrl()'>Copy Current Page Url</div>"
// document.body.appendChild(ctxmenudiv)

function requestUrl() {console.log("BSCReceive|CurUrlReq")}

if (document.addEventListener) {
    document.addEventListener('contextmenu', function(e) {
        // CTXMenu()
        alert("You've tried to open context menu");
        e.preventDefault();
    });
} else {
    document.attachEvent('oncontextmenu', function() {
        // CTXMenu()
        alert("You've tried to open context menu");
        window.event.returnValue = false;
    });
}