/*
Copyright © 2015 Infrared5, Inc. All rights reserved.

The accompanying code comprising examples for use solely in conjunction with Red5 Pro (the "Example Code") 
is  licensed  to  you  by  Infrared5  Inc.  in  consideration  of  your  agreement  to  the  following  
license terms  and  conditions.  Access,  use,  modification,  or  redistribution  of  the  accompanying  
code  constitutes your acceptance of the following license terms and conditions.

Permission is hereby granted, free of charge, to you to use the Example Code and associated documentation 
files (collectively, the "Software") without restriction, including without limitation the rights to use, 
copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit 
persons to whom the Software is furnished to do so, subject to the following conditions:

The Software shall be used solely in conjunction with Red5 Pro. Red5 Pro is licensed under a separate end 
user  license  agreement  (the  "EULA"),  which  must  be  executed  with  Infrared5,  Inc.   
An  example  of  the EULA can be found on our website at: https://account.red5pro.com/assets/LICENSE.txt.

The above copyright notice and this license shall be included in all copies or portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,  INCLUDING  BUT  
NOT  LIMITED  TO  THE  WARRANTIES  OF  MERCHANTABILITY, FITNESS  FOR  A  PARTICULAR  PURPOSE  AND  
NONINFRINGEMENT.   IN  NO  EVENT  SHALL INFRARED5, INC. BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
WHETHER IN  AN  ACTION  OF  CONTRACT,  TORT  OR  OTHERWISE,  ARISING  FROM,  OUT  OF  OR  IN CONNECTION 
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
(function (window, navigator, red5prosdk) { // eslint-disable-line no-unused-vars
  'use strict';

  var callback;
  var mediaConstraints;
  var cameraSelect = document.getElementById('camera-select');
  var microphoneSelect = document.getElementById('microphone-select');

  function updateMediaStreamTrack (constraints, trackKind, callback, element) {
    if (element.srcObject) {
      element.srcObject.getTracks().forEach(t => t.stop())
      element.srcObject = null
    }
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (stream) {
        callback(stream)
        element.srcObject = stream
      })
      .catch (function (error) {
        console.error('Could not replace track : ' + error.message);
      });
  }

  function onCameraSelect (camera, constraints, callback, element) {
    var newConstraints = Object.assign({}, constraints);
    if (newConstraints.video && typeof newConstraints.video !== 'boolean') {
      newConstraints.video.deviceId = { exact: camera }
    }
    else {
      newConstraints.video = {
        deviceId: { exact: camera }
      };
    }
    updateMediaStreamTrack(newConstraints, 'video', callback, element);
  }

  function onMicrophoneSelect (microphone, constraints, callback, element) {
    var newConstraints = Object.assign({}, constraints);
    if (newConstraints.audio && typeof newConstraints.audio !== 'boolean') {
      newConstraints.audio.deviceId = { exact: microphone }
    }
    else {
      newConstraints.audio = {
        deviceId: { exact: microphone }
      };
    }
    updateMediaStreamTrack(newConstraints, 'audio', callback, element);
  }

  function setSelectedCameraIndexFromTrack (track, deviceList) {
    var i = deviceList.length;
    while (--i > -1) {
      var option = deviceList[i];
      if (option.label === track.label) {
        break;
      }
    }
    if (i > -1) {
      cameraSelect.selectedIndex = i;
    }
  }

  function setSelectedMicrophoneIndexFromTrack (track, deviceList) {
    var i = deviceList.length;
    while (--i > -1) {
      var option = deviceList[i];
      if (option.label === track.label) {
        break;
      }
    }
    if (i > -1) {
      microphoneSelect.selectedIndex = i;
    }
  }

  function updateAudioDeviceList (audioTrack, constraints, callback, element, devicePromise) {
    devicePromise.then(function (devices) {
        var mics = devices.filter(function (item) {
          return item.kind === 'audioinput';
        })
        var options = mics.map(function (mic, index) {
          return '<option value="' + mic.deviceId + '">' + (mic.label || 'camera ' + index) + '</option>';
        });
        microphoneSelect.innerHTML = options.join(' ');
        microphoneSelect.addEventListener('change', function () {
          onMicrophoneSelect(microphoneSelect.value, constraints, callback, element);
        });
        setSelectedMicrophoneIndexFromTrack(audioTrack, mics);
      })
      .catch(function (error) {
        console.error('Could not access microphone devices: ' + error);
      });
  }

  function updateCameraDeviceList (videoTrack, constraints, callback, element, devicePromise) {
    devicePromise.then(function (devices) {
        var cameras = devices.filter(function (item) {
          return item.kind === 'videoinput';
        })
        var options = cameras.map(function (camera, index) {
          return '<option value="' + camera.deviceId + '">' + (camera.label || 'camera ' + index) + '</option>';
        });
        cameraSelect.innerHTML = options.join(' ');
        cameraSelect.addEventListener('change', function () {
          onCameraSelect(cameraSelect.value, constraints, callback, element);
        });
        setSelectedCameraIndexFromTrack(videoTrack, cameras);
      })
      .catch(function (error) {
        console.error('Could not access camera devices: ' + error);
      });
  }

  function beginMediaMonitor (mediaStream, callback, constraints, element) {
    var tracks = mediaStream.getTracks();
    var audioTracks = tracks.filter(function (track) { return track.kind === 'audio' });
    var videoTracks = tracks.filter(function (track) { return track.kind === 'video' });
    var devicePromise = navigator.mediaDevices.enumerateDevices();
    updateCameraDeviceList(videoTracks[0], constraints, callback, element, devicePromise);
    updateAudioDeviceList(audioTracks[0], constraints, callback, element, devicePromise);
  }

  var hasBegunMonitor = false;
  window.allowMediaStreamSwap = function (viewElement, constraints, mediaStream, callback) {
    if (hasBegunMonitor) return;
    hasBegunMonitor = true;
    callback = callback;
    mediaConstraints = constraints;
    beginMediaMonitor(mediaStream, callback, mediaConstraints, viewElement);
  }

})(window, navigator, window.red5prosdk);
