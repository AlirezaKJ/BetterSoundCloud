const LSDBPrefix = ""

// LocalStorage ShortHands
function dbGetItem(key) {
    result = localStorage.getItem(LSDBPrefix + key)
    return result
}

function dbSetItem(key,value) {
    localStorage.setItem(LSDBPrefix + key, value)
    // result = dbGetItem(key)
    // return result
}

function dbResolve(key,defaultvalue) {
    if (dbGetItem(LSDBPrefix + key) === null) {
        dbSetItem(LSDBPrefix + key,defaultvalue)
    }
    return dbGetItem(key)
}


function dbDeleteItem(key) {
    localStorage.removeItem(LSDBPrefix + key)
}

function dbClear() {
    localStorage.clear()
}