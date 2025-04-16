// test-jimp.js
const Jimp = require('jimp');
Jimp.read(100, 100, 0xffffffff).then(image => {
    console.log('Jimp image created:', !!image);
}).catch(err => {
    console.error('Jimp error:', err);
});