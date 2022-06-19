
var _ = require('underscore')
var deepEqual = require('deep-equal')
const cloneDeep = require('clone-deep');


function difference (a, b) { 
	return Math.abs(a - b); 
}

function objDiff(a,b) { // see how a is different from b
    var r = {};
    _.each(a, function(v,k) {
        if(deepEqual(b[k], v)) return;
        // but what if it returns an empty object? still attach?
        r[k] = _.isObject(v)
                ? _.difference(v, b[k])
                : v
            ;
        });
    return r;
}

function deepClone (obj) {
    return cloneDeep(obj)
}

//function allEqual_old (arr, val, obj, key) {
//    if (obj && key && val) {
//        return arr.every( v => v[key] === arr[0][key] && v[key] === val )
//    }
//    else if (val) {
//		return arr.every( v => v === arr[0] && v === val )
//	}
//	else {
//		return arr.every( v => v === arr[0] )
//	}
//}

function allEqual(arr,val,obj,key) {
    if (!obj && !key && !val) {
        return arr.every( v => v === arr[0] )
    }
    if (!obj && !key) {
        return arr.every( v => v === arr[0] && v === val )
    }
    return arr.every( v => v[key] === arr[0][key] && v[key] === val )
}

function isObject(o) {
    return o !== null && typeof o === 'object' && Array.isArray(o) === false;
}

const removeEmptyFromObject = obj => {
    let newObj = {}
    Object.keys(obj).forEach(key => {
        if (obj[key] && isObject(obj[key])) {
            newObj[key] = removeEmptyFromObject(obj[key]); // recurse
        }
        else if (obj[key] && Array.isArray(obj[key])) {
            newObj[key] = removeEmptyFromArray(obj[key])
        }
        else if (obj[key] != null) {
            newObj[key] = obj[key];
        }
    });
    return newObj
};

const removeEmptyFromArray = arr => {
    let newArr = []
    arr.forEach(item => {
        if (item && isObject(item)) {
            let newItem = removeEmptyFromObject(item)
            newArr.push(newItem)
        }
        else if (item && Array.isArray(item)) {
            let newItem = removeEmptyFromArray(item)
            newArr.push(newItem)
        }
        else if (item != null) {
            newArr.push(item)
        }
    })
    return newArr
}

function toBoolean(inp) {
    if (typeof inp === 'boolean') {
        return inp
    }
    if (inp) {
        inp = inp.toLowerCase()
    }
    else {
        inp =false
    }
    
    if (inp != "true" && inp != true) {
        return false
    }
    else {
        return true
    }
}

function isFunction(fn) {
    if (fn instanceof Function) {
        return true
    }
    return false
}

function getObjectId(id) {
	return new require('mongodb').ObjectID(id);
}

function splitUp(arr, n) {
    
    let groups = _.map(arr, function(item, index){
  
        return index % n === 0 ? arr.slice(index, index + n) : null; 
    })
    .filter(function(item){ return item; });

    return groups
}

function cleanHashtag(value) {
    function cleanFirstLetter(v) {
        let containsNonLetter = /^[^a-z]/.test(v)
        if (containsNonLetter) {
            v = v.substr(1)
            cleanFirstLetter(v)
        }
        return v
    }
    value = value.toLowerCase()
    value = value.replace(/[^a-z0-9]/g, '')
    value = cleanFirstLetter(value)
    return value
}

module.exports = {
	difference,
	allEqual,
	isObject,
	removeEmptyFromObject,
    removeEmptyFromArray,
    toBoolean,
    objDiff,
    deepClone,
    getObjectId,
    isFunction,
    splitUp,
    cleanHashtag
};