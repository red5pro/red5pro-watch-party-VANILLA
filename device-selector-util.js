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

  var isTranscode = window.getParameterByName('transcode') && window.getParameterByName('transcode') === 'true'

  var callback;
  var provisionCallback;
  var mediaConstraints;
  var cameraSelect = document.getElementById('camera-select');
  var microphoneSelect = document.getElementById('microphone-select');
  var resContainer = document.getElementById('res-container');
  var selectedResolutions = []

  // List of default HD resolutions. Used in determining browser support for Camera.
  var hd = [
    {width: 160, height: 120, frameRate: 15, bandwidth: 256, media: undefined},
    {width: 320, height: 240, frameRate: 15, bandwidth: 256, media: undefined},
    {width: 640, height: 360, frameRate: 15, bandwidth: 512, media: undefined},
    {width: 640, height: 480, frameRate: 15, bandwidth: 512, media: undefined},
    {width: 854, height: 480, frameRate: 15, bandwidth: 750, media: undefined},
    {width: 1280, height: 720, frameRate: 30, bandwidth: 1500, media: undefined},
    {width: 1920, height: 1080, frameRate: 30, bandwidth: 3000, media: undefined},
    {width: 3840, height: 2160, frameRate: 30, bandwidth: 4500, media: undefined}
  ];

  const onTranscodeSelect = el => {
    const id = parseInt(el.currentTarget.value, 10)
    if (el.currentTarget.checked) {
      if (selectedResolutions.length === 3) {
        const reject = selectedResolutions.pop()
        document.querySelector(`input[value="${hd.findIndex(o => o === reject)}"]`).checked = false
      }
      selectedResolutions.push(hd[id])
    } else {
      const index = selectedResolutions.findIndex(o => o === hd[id])
      if (index > -1) {
        selectedResolutions.splice(index, 1)
      }
    }
    let indices = selectedResolutions.map(r => hd.indexOf(r)).sort().reverse()
    selectedResolutions = indices.map(i => hd[i])
    if (provisionCallback) {
      provisionCallback(selectedResolutions)
    }
  }

  function displayAvailableResolutions (deviceId, list) {
    // Clear resolution selection UI.
    while (resContainer.firstChild) {
      resContainer.removeChild(resContainer.firstChild)
    }
    selectedResolutions = []
    // UI builder for resolution option to select from.
    var generateResOption = function(dim, index, enabled) {
      var res = [dim.width, dim.height].join('x')
      var framerate = dim.frameRate;
      var bitrate = dim.bandwidth;
      var tr = document.createElement('tr');
      var resTD = document.createElement('td');
      var frTD = document.createElement('td');
      var bitrateTD = document.createElement('td');
      var acceptedTD = document.createElement('td');
      var transcodeTD = document.createElement('td');
      var resText = document.createTextNode(res)
      var ftText = document.createTextNode(framerate);
      var bitrateText = document.createTextNode(bitrate);
      var accText = document.createTextNode(enabled ? '✓' : '⨯');
      var transcodeSelect = document.createElement('input')
      transcodeSelect.type = 'checkbox'
      transcodeSelect.value = index
      transcodeSelect.classList.add('transcode-select')

      tr.id = 'dimension-' + index;
      tr.classList.add('settings-control');
      tr.appendChild(resTD);
      tr.appendChild(frTD);
      tr.appendChild(bitrateTD);
      tr.appendChild(acceptedTD);
      tr.appendChild(transcodeTD);
      tr.classList.add('table-row');
      if (!enabled) {
        tr.classList.add('table-row-disabled');
        transcodeSelect.disabled = true
      }
      resTD.appendChild(resText);
      frTD.appendChild(ftText);
      bitrateTD.appendChild(bitrateText);
      acceptedTD.appendChild(accText);
      transcodeTD.appendChild(transcodeSelect);
      [resTD, frTD, bitrateTD, acceptedTD, transcodeTD].forEach(function (td) {
        td.classList.add('table-entry');
      });
      if (enabled) {
        transcodeSelect.addEventListener('click', onTranscodeSelect, true);
      }
      return tr;
    }
    return new Promise(function (resolve) {
      // For each HD listing, check if resolution is supported in the browser and 
      //  add to selection UI if available.
      var checkValid = function (index) {
        var dim = list[index];
        var constraints = {
          audio:false, 
          video: {
            width: { exact: dim.width },
            height: { exact: dim.height },
            //            frameRate: { exact: dim.frameRate },
            deviceId: deviceId
          }
        };

        navigator.mediaDevices.getUserMedia(constraints)
          .then(function (media) {
            // If resolution supported, generate UI entry and add event listener for selection.
            if (dim.media) {
              dim.media.getVideoTracks().forEach(function (track) {
                track.stop();
              });
            }
            dim.media = media;
            resContainer.appendChild(generateResOption(dim, index, true))
            //            selectResolutionForBroadcast(dim, index);
            if (index === list.length - 1) {
              resolve();
            } else {
              checkValid(++index);
            }
          })
          .catch(function (error) {
            console.log(error.name + ':: ' + JSON.stringify(dim));
            resContainer.appendChild(generateResOption(dim, index, false))
            resContainer.firstChild.firstChild.setAttribute('checked', 'checked')
            if (index === list.length - 1) {
              resolve();
            } else {
              checkValid(++index);
            }
          });
      };

      checkValid(0);
    });
  }

  function updateMediaStreamTrack (constraints, trackKind, callback, element) {
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (stream) {
        callback(stream, constraints)
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
    if (isTranscode) {
      displayAvailableResolutions(camera, hd)
    }
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
      if (isTranscode) {
        displayAvailableResolutions(deviceList[i].deviceId, hd)
      }
    }
    return i
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
    return i
  }

  function updateAudioDeviceList (mics, audioTrack, constraints, callback, element) {
    var options = mics.map(function (mic, index) {
      return '<option value="' + mic.deviceId + '">' + (mic.label || 'camera ' + index) + '</option>';
    });
    microphoneSelect.innerHTML = options.join(' ');
    microphoneSelect.addEventListener('change', function () {
      onMicrophoneSelect(microphoneSelect.value, constraints, callback, element);
    });
    return setSelectedMicrophoneIndexFromTrack(audioTrack, mics);
  }

  function updateCameraDeviceList (cameras, videoTrack, constraints, callback, element) {
    var options = cameras.map(function (camera, index) {
      return '<option value="' + camera.deviceId + '">' + (camera.label || 'camera ' + index) + '</option>';
    });
    cameraSelect.innerHTML = options.join(' ');
    cameraSelect.addEventListener('change', function () {
      onCameraSelect(cameraSelect.value, constraints, callback, element);
    });
    return setSelectedCameraIndexFromTrack(videoTrack, cameras);
  }

  const beginMediaMonitor = async (mediaStream, callback, constraints, element) => {
    var tracks = mediaStream.getTracks();
    var audioTracks = tracks.filter(function (track) { return track.kind === 'audio' });
    var videoTracks = tracks.filter(function (track) { return track.kind === 'video' });
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameraDevices = devices.filter(d => d.kind === 'videoinput')
      const audioDevices = devices.filter(d => d.kind === 'audioinput')
      const cameraId = updateCameraDeviceList(cameraDevices, videoTracks[0], constraints, callback, element);
      const audioId = updateAudioDeviceList(audioDevices, audioTracks[0], constraints, callback, element);
      if (cameraId > -1) {
        if (!constraints.video.deviceId) {
          constraints.video.deviceId = {}
        }
        constraints.video.deviceId.exact = cameraDevices[cameraId].deviceId
      }
      if (audioId > -1) {
        if (typeof constraints.audio === 'boolean') {
          constraints.audio = {}
        }
        if (!constraints.audio.deviceId) {
          constraints.audio.deviceId = {}
        }
        constraints.audio.deviceId.exact = audioDevices[audioId].deviceId
      }
      callback(mediaStream, constraints)
    } catch (e) {
      console.error('Could not access media devices: ' + e.message)
    }
  }

  var hasBegunMonitor = false;
  window.allowMediaStreamSwap = function (viewElement, constraints, mediaStream, callback) {
    if (hasBegunMonitor) return;
    hasBegunMonitor = true;
    callback = callback;
    mediaConstraints = constraints;
    beginMediaMonitor(mediaStream, callback, mediaConstraints, viewElement);
  }
  window.registerProvisionCallback = callback => provisionCallback = callback

})(window, navigator, window.red5prosdk);
