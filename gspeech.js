const speech = require('@google-cloud/speech');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
var express = require('express');
var multer  = require('multer');
var wavFileInfo = require('wav-file-info');

const upload = multer({
  dest: 'uploads/'
}); 

const gclient = new speech.SpeechClient({
  keyFilename: __dirname+'/google-cloud.json'
});

const app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/', upload.single('file-to-upload'), (req, res) => {

  res.setHeader('Content-Type', 'application/json');
  
  if(req.file){
    console.log("Received file via POST. Renaming..");
    fs.rename(req.file.destination+req.file.filename, req.file.destination+req.file.filename+".wav", function (err) {
      if (err){
        res.send(JSON.stringify({error:'File could not be renamed!'}));
      }
      else{
        console.log('Rename complete');
        console.log('Checking file is WAV..');
        wavFileInfo.infoByFilename(req.file.destination+req.file.filename+".wav", function(err, info){
          if (err){
            res.send(JSON.stringify({error:'File is not WAV!'}));
          }
          else{
            if(info.duration<=60){
              console.log("File is WAV: "+JSON.stringify(info));
              process(req.file.destination,req.file.filename,res);
            }
            else{
              res.send(JSON.stringify({error:'Audio is too long (max: 1 min)'}));
            }
          }
        });
      }
    });
  }

  else{
    res.send(JSON.stringify({error:'No POST data found!'}));
  }
  
});

app.listen(3000);

console.log('Listening on 3000')

function process(destination,filename,res){

  console.log("Converting stereo to mono..");
  ffmpeg(destination+filename+".wav").audioChannels(1).output(destination+filename+"_mono.wav").on('end',function(){ 
    console.log("Conversion complete");
    recognize(destination,filename+"_mono.wav",res); 
  }).run(); 

}  

function recognize(destination, filename,res){

  console.log("Recognizing speech..");

  const file = fs.readFileSync(destination+filename);
  const audioBytes = file.toString('base64');

  const audio = {
    content: audioBytes,
  };

  const config = {
    enableWordTimeOffsets:true,
    languageCode: 'en-US',
  };

  const request = {
    audio: audio,
    config: config,
  };

  var output={transcript:[],words:[]};
   
  gclient
    .recognize(request)
    .then(data => {
      const response = data[0];
      response.results.forEach(result=>{
        output.transcript.push(result.alternatives[0].transcript);
        result.alternatives[0].words.forEach(wordInfo=>{
          output.words.push(wordInfo);
        })
      })
      console.log("Recognition complete");
      console.log("Saving file..")
      fs.writeFile(destination+filename+".json", JSON.stringify(output), 'utf8', function (err) {
          if (err) {
              return console.log(err);
          }
          console.log("File saved!");
          res.send(JSON.stringify(output));
      }); 
    })
    .catch(err => {
      console.error('ERROR:', err);
    });

}