'use strict'

var express = require('express')
var multer = require('multer')
var upload = multer({ dest: 'uploads/' })
var fs = require('fs-extra')

// -------------------------------------
// change this password!!
// -------------------------------------
const PASSWORD = '1Qazxsw2'
// -------------------------------------

var app = express()

app.use(express.static('public'))

app.post('/api/upload', upload.fields([{ name: 'data' }, { name: 'pdf' }]), function(req, res, next) {
    if (req.body.password != PASSWORD) {
        console.warn('wrong password')
        return res.redirect('/upload/badpassword')
    }
    console.log('files', req.files)
    if (req.files.data) {
        const file = req.files.data[0]
        console.log('uploaded data file:', file.originalname)
        fs.renameSync(`${__dirname}/${file.path}`, `${__dirname}/public/data/data.json`)
    }
    if (req.files.pdf) {
        const file = req.files.pdf[0]
        console.log('uploaded pdf:', file.originalname)
        fs.ensureDirSync(`${__dirname}/public/data/pdf`)
        fs.renameSync(`${__dirname}/${file.path}`, `${__dirname}/public/data/pdf/${file.originalname}`)
    }
    fs.emptyDirSync(`${__dirname}/uploads`) // clean temp upload folder

    res.redirect('/upload/success')
})

var server = app.listen(8002, function() {
    var host = server.address().address
    var port = server.address().port
    console.log(`server listening at http://${host}:${port}`)
})
