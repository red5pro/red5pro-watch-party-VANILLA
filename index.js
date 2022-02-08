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
(function(window, document, red5prosdk) {
  'use strict';

  var isPublishing = false;
  var isDebug = window.getParameterByName('debug') && window.getParameterByName('debug') === 'true'
  var isSM = window.getParameterByName('sm') && window.getParameterByName('sm') === 'true'
  var smToken = window.getParameterByName('smToken') || 'abc123'
  var isTranscode = window.getParameterByName('transcode') && window.getParameterByName('transcode') === 'true'

  var serverSettings = (function() {
    var settings = sessionStorage.getItem('r5proServerSettings');
    try {
      return JSON.parse(settings);
    }
    catch (e) {
      console.error('Could not read server settings from sessionstorage: ' + e.message);
    }
    return {};
  })();

  var configuration = (function () {
    var conf = sessionStorage.getItem('r5proTestBed');
    try {
      return JSON.parse(conf);
    }
    catch (e) {
      console.error('Could not read testbed configuration from sessionstorage: ' + e.message);
    }
    return {}
  })();
  red5prosdk.setLogLevel(configuration.verboseLogging ? red5prosdk.LOG_LEVELS.TRACE : red5prosdk.LOG_LEVELS.WARN);

  var updateStatusFromEvent = window.red5proHandlePublisherEvent; // defined in src/template/partial/status-field-publisher.hbs

  var targetPublisher;
  var mediaStream;
  var mediaStreamConstraints;
  var hostSocket;
  var roomName = window.query('room') || 'red5pro'; // eslint-disable-line no-unused-vars
  var streamName = window.query('streamName') || ['publisher', Math.floor(Math.random() * 0x10000).toString(16)].join('-');
  var socketEndpoint = window.query('socket') || 'localhost';
  var hostEndpoint = window.getParameterByName('host');

  configuration.host = hostEndpoint || configuration.host
  
  var roomField = document.getElementById('room-field');
  // eslint-disable-next-line no-unused-vars
  var publisherContainer = document.getElementById('publisher-container');
  var publisherMuteControls = document.getElementById('publisher-mute-controls');
  var publisherSession = document.getElementById('publisher-session');
  var publisherNameField = document.getElementById('publisher-name-field');
  var streamNameField = document.getElementById('streamname-field');
  var publisherVideo = document.getElementById('red5pro-publisher');
  var audioCheck = document.getElementById('audio-check');
  var videoCheck = document.getElementById('video-check');
  var joinButton = document.getElementById('join-button');
  var postProvisionButton = document.getElementById('post-button');
  var statisticsField = document.getElementById('statistics-field');
  var bitrateField = document.getElementById('bitrate-field');
  var packetsField = document.getElementById('packets-field');
  var resolutionField = document.getElementById('resolution-field');
  var mainProgram = document.getElementById('red5pro-mainVideoView');
  var bitrateTrackingTicket;
  var bitrate = 0;
  var packetsSent = 0;
  var frameWidth = 0;
  var frameHeight = 0;

  var forceClosed = false;
  var PACKETS_OUT_TIME_LIMIT = 5000;
  var packetsOutTimeout = 0;

  const STATE_TRANSCODE = 1
  const STATE_SETUP = 2
  const STATE_IS_STARTING = 3
  const STATE_IS_PUBLISHING = 4
  const setState = state => {
    switch (state) {
      case STATE_TRANSCODE:
        Array.prototype.slice.call(document.querySelectorAll('.remove-on-transcode')).forEach(el => el.classList.add('hidden'))
        window.registerProvisionCallback(handleProvisionChange)
        document.querySelector('#camera-select').disabled = false
        document.querySelector('#microphone-select').disabled = false
        document.querySelector('#room-field').disabled = false
        document.querySelector('#streamname-field').disabled = false
        joinButton.disabled = false
        postProvisionButton.disabled = false
        postProvisionButton.addEventListener('click', handlePostProvisions, true)
        break;
      case STATE_SETUP:
        Array.prototype.slice.call(document.querySelectorAll('.remove-on-transcode')).forEach(el => el.classList.remove('hidden'))
        Array.prototype.slice.call(document.querySelectorAll('.remove-on-setup')).forEach(el => el.classList.add('hidden'))
        document.querySelector('#camera-select').disabled = false
        document.querySelector('#microphone-select').disabled = false
        document.querySelector('#room-field').disabled = false
        document.querySelector('#streamname-field').disabled = false
        joinButton.disabled = false
        postProvisionButton.disabled = false
        break;
      case STATE_IS_STARTING:
        document.querySelector('#camera-select').disabled = true
        document.querySelector('#microphone-select').disabled = true
        document.querySelector('#room-field').disabled = true
        document.querySelector('#streamname-field').disabled = true
        joinButton.disabled = true
        postProvisionButton.disabled = true
        postProvisionButton.removeEventListener('click', handlePostProvisions, true)
        break;
      case STATE_IS_PUBLISHING:
        createMainVideo()
        updateInitialMediaOnPublisher()
        break;
    }
  }

  let transcoderPOST = {
    meta: {
      authentication: {
        username: '',
        password: '',
        token: undefined
      },
      stream: [],
      georules: {
        regions: ['US', 'UK'],
        restricted: false
      },
      qos: 3
    }
  }
  let selectedProvisions = []
  const handleProvisionChange = (list) => {
    selectedProvisions = list
  }

  const handlePostProvisions = async () => {
    if (selectedProvisions.length < 3) {
      showErrorAlert('Please select 3 Variants for provisioning the transcoder.')
      return
    }
    const host = configuration.host
    const name = streamNameField.value
    const room = roomField.value
    let framerate = 15
    const streams = selectedProvisions.map((res, index) => {
      if (index === 0) framerate = res.frameRate
      return {
        level: index+1,
        name: `${name}_${index+1}`,
        properties: {
          videoBR: res.bandwidth * 1000,
          videoWidth: res.width,
          videoHeight: res.height
        }
      }
    }).reverse()
    const highestLevel = streams.find(e => e.level === 1)
    transcoderPOST.meta.stream = streams
    try {
      console.log('POST', transcoderPOST)
      const payload = await window.streamManagerUtil.postTranscode(host, `live/${room}`, `${name}`, transcoderPOST, smToken)
      console.log('PYALOAD', payload)
      startBroadcastWithLevel(highestLevel, room, name, framerate)
    } catch (e) {
      console.error(e)
      if (/Provision already exists/.exec(e.message)) {
        startBroadcastWithLevel(highestLevel, room, name, framerate)
      } else {
        showErrorAlert(e.message)
      }
    }
  }

  function showErrorAlert (message) {
    const al = document.querySelector('.alert')
    const msg = al.querySelector('.alert-message')
    const submit = al.querySelector('#alert-submit')
    msg.innerText = message
    al.classList.remove('hidden')
    submit.addEventListener('click', () => {
      al.classList.add('hidden')
    })
    window.scrollTo(0, 0)
  }

  function notifyOfPublishFailure () {
    showErrorAlert('There seems to be an issue with broadcasting your stream. Please reload this page and join again.')
  }

  function startPublishTimeout () {
    packetsOutTimeout = setTimeout(() => {
      clearTimeout(packetsOutTimeout)
      // TODO: Notify something wrong.
      notifyOfPublishFailure()
    }, PACKETS_OUT_TIME_LIMIT)
  }

  function updateStatistics (b, p, w, h) {
    //statisticsField.classList.remove('hidden');
    bitrateField.innerText = b === 0 ? 'N/A' : Math.floor(b);
    packetsField.innerText = p;
    resolutionField.innerText = (w || 0) + 'x' + (h || 0);
  }

  function onBitrateUpdate (b, p) {
    bitrate = b;
    packetsSent = p;
    updateStatistics(bitrate, packetsSent, frameWidth, frameHeight);
    if (packetsSent > 100) {
      clearTimeout(packetsOutTimeout)
      establishSocketHost(targetPublisher, roomField.value, streamNameField.value);
    }
  }

  function onResolutionUpdate (w, h) {
    frameWidth = w;
    frameHeight = h;
    updateStatistics(bitrate, packetsSent, frameWidth, frameHeight);
  }

  roomField.value = roomName;
  streamNameField.value = streamName;
  audioCheck.checked = configuration.useAudio;
  videoCheck.checked = configuration.useVideo;

  joinButton.addEventListener('click', function () {
    saveSettings();
    if (isDebug) {
      document.querySelectorAll('.debug').forEach(e => e.classList.remove('hidden'))
      document.querySelector('.debug').innerText = streamName;
    }
    setState(STATE_IS_STARTING)
    doPublish(mediaStream, roomName, streamName);
  });

  audioCheck.addEventListener('change', updateMutedAudioOnPublisher);
  videoCheck.addEventListener('change', updateMutedVideoOnPublisher);

  var protocol = serverSettings.protocol;
  var isSecure = configuration.host.match(/localhost/) === null; //true; //protocol == 'https';

  function saveSettings () {
    streamName = streamNameField.value;
    roomName = roomField.value;
  }

  function updateMutedAudioOnPublisher () {
    if (targetPublisher && isPublishing) {
      var c = targetPublisher.getPeerConnection();
      var senders = c.getSenders();
      var params = senders[0].getParameters();
      if (audioCheck.checked) { 
        if (audioTrackClone) {
          senders[0].replaceTrack(audioTrackClone);
          audioTrackClone = undefined;
        } else {
          try {
            targetPublisher.unmuteAudio();
            params.encodings[0].active = true;
            senders[0].setParameters(params);
          } catch (e) {
            // no browser support, let's use mute API.
            targetPublisher.unmuteAudio();
          }
        }
      } else { 
        try {
          targetPublisher.muteAudio();
          params.encodings[0].active = false;
          senders[0].setParameters(params);
        } catch (e) {
          // no browser support, let's use mute API.
          targetPublisher.muteAudio();
        }
      }
    }
  }

  function updateMutedVideoOnPublisher () {
    if (targetPublisher && isPublishing) {
      if (videoCheck.checked) {
        if (videoTrackClone) {
          var c = targetPublisher.getPeerConnection();
          var senders = c.getSenders();
          senders[1].replaceTrack(videoTrackClone);
          videoTrackClone = undefined;
        } else {
          targetPublisher.unmuteVideo();
        }
      } else { 
        targetPublisher.muteVideo(); 
      }
    }
    !videoCheck.checked && showVideoPoster();
    videoCheck.checked && hideVideoPoster();
  }

  var audioTrackClone;
  var videoTrackClone;
  function updateInitialMediaOnPublisher () {
    var t = setTimeout(function () {
      // If we have requested no audio and/or no video in our initial broadcast,
      // wipe the track from the connection.
      var audioTrack = targetPublisher.getMediaStream().getAudioTracks()[0];
      var videoTrack = targetPublisher.getMediaStream().getVideoTracks()[0];
      var connection = targetPublisher.getPeerConnection();
      if (!videoCheck.checked) {
        videoTrackClone = videoTrack.clone();
        connection.getSenders()[1].replaceTrack(null);
      }
      if (!audioCheck.checked) {
        audioTrackClone = audioTrack.clone();
        connection.getSenders()[0].replaceTrack(null);
      }
      clearTimeout(t);
    }, 2000); 
  }

  function showVideoPoster () {
    publisherVideo.classList.add('hidden');
  }

  function hideVideoPoster () {
    publisherVideo.classList.remove('hidden');
  }

  function getSocketLocationFromProtocol () {
    return !isSecure
      ? {protocol: 'ws', port: serverSettings.wsport}
      : {protocol: 'wss', port: serverSettings.wssport};
  }

  function onPublisherEvent (event) {
    console.log('[Red5ProPublisher] ' + event.type + '.');
    if (event.type === 'WebSocket.Message.Unhandled') {
      console.log(event);
    } else if (event.type === 'Publisher.Connection.Closed' && !forceClosed) {
      notifyOfPublishFailure()
    }
    // updateStatusFromEvent(event);
  }
  function onPublishFail (message) {
    isPublishing = false;
    notifyOfPublishFailure()
    console.error('[Red5ProPublisher] Publish Error :: ' + message);
  }
  function onPublishSuccess (publisher) {
    isPublishing = true;
    window.red5propublisher = publisher;
    console.log('[Red5ProPublisher] Publish Complete.');
    //here remove hidden main video 
    //establishSharedObject(publisher, roomField.value, streamNameField.value);
    if (publisher.getType().toUpperCase() !== 'RTC') {
      establishSocketHost(publisher, roomField.value, streamNameField.value);
    }
    try {
      var pc = publisher.getPeerConnection();
      var stream = publisher.getMediaStream();
      bitrateTrackingTicket = window.trackBitrate(pc, onBitrateUpdate, null, null, true);
      //statisticsField.classList.remove('hidden');
      mainProgram.classList.remove('hidden');
      stream.getVideoTracks().forEach(function (track) {
        var settings = track.getSettings();
        onResolutionUpdate(settings.width, settings.height);
      });
    }
    catch (e) {
    }
    setState(STATE_IS_PUBLISHING)
  }
  function onUnpublishFail (message) {
    isPublishing = false;
    console.error('[Red5ProPublisher] Unpublish Error :: ' + message);
  }
  function onUnpublishSuccess () {
    isPublishing = false;
    console.log('[Red5ProPublisher] Unpublish Complete.');
  }

  function getAuthenticationParams () {
    var auth = configuration.authentication;
    return auth && auth.enabled
      ? {
        connectionParams: {
          username: auth.username,
          password: auth.password
        }
      }
      : {};
  }

  function getUserMediaConfiguration () {
    return {
      mediaConstraints: {
        audio: configuration.useAudio ? configuration.mediaConstraints.audio : false,
        video: configuration.useVideo ? configuration.mediaConstraints.video : false
      }
    };
  }

  function setPublishingUI (streamName) {
    const tray = document.querySelector('.bottom-viewers')
    const pubView = document.querySelector('#red5pro-publisher')
    pubView.parentNode.removeChild(pubView)
    tray.appendChild(pubView)
    pubView.classList.add('red5pro-publisher')

    publisherNameField.innerText = streamName;
    roomField.setAttribute('disabled', true);
    publisherSession.classList.remove('hidden');
    //publisherNameField.classList.remove('hidden');
    //publisherMuteControls.classList.remove('hidden');
    Array.prototype.forEach.call(document.getElementsByClassName('remove-on-broadcast'), function (el) {
      el.classList.add('hidden');
    });
  }

  // eslint-disable-next-line no-unused-vars
  function updatePublishingUIOnStreamCount (streamCount) {
    /*if (streamCount > 0) {
      publisherContainer.classList.remove('margin-center');
    } else {
      publisherContainer.classList.add('margin-center');
    }*/
  }

  function establishSocketHost (publisher, roomName, streamName) {
    if (hostSocket) return
    var wsProtocol = isSecure ? 'wss' : 'ws'
    // var url = `${wsProtocol}://${socketEndpoint}?room=${roomName}&streamName=${streamName}`
    // hacked to support remote server while doing local development
    var url = `wss://demo-live.red5.net:8443?room=${roomName}&streamName=${streamName}`
    hostSocket = new WebSocket(url)
    hostSocket.onmessage = function (message) {
      var payload = JSON.parse(message.data)
      if (roomName === payload.room) {
        processStreams(payload.streams, streamsList, roomName, streamName);
      }
    }
  }

  const createMainVideo = async () => {

    const retry = () => {
      var t = setTimeout(() => {
        console.log('Retrying playback of main video.')
        clearTimeout(t)
        createMainVideo()
      }, 1000)
    }

    try {

      let config = {
        protocol: 'wss',
        port: 443,
        host: 'demo-live.red5.net',
        app: 'live',
        streamName: 'demo-stream',
        mediaElementId: 'red5pro-mainVideoView',
        subscriptionId: 'demo-stream' + Math.floor(Math.random() * 0x10000).toString(16)
      }
      /* No Stream Manager support for main video.
      if (isSM) {
        const payload = await window.streamManagerUtil.getEdge('demo-live.red5.net', 'live', 'demo-stream_3')
        const { scope, serverAddress } = payload
        config = {...config, ...{
          app: 'streammanager',
          connectionParams: {
            host: serverAddress,
            app: scope
          }
        }}
      }
      */
      var mainVideo = new red5prosdk.RTCSubscriber();
      mainVideo.on('*', event => {
        if (event.type === 'Subscribe.Time.Update') return
        console.log('DEMO', `demo event: ${event.type}.`)
        if (event.type === 'Subscribe.Connection.Closed') {
          retry()
        }
      })
      await mainVideo.init(config)
      await mainVideo.subscribe()
    } catch (e) {
      console.error(error)
      retry()
    }
  }

  const startPreview = async () => {
    const element = document.querySelector('#red5pro-publisher')
    const constraints = {
      audio: true,
      video: {
        width: {
          exact: 640
        },
        height: {
          exact: 480
        },
        frameRate: {
          exact: 15
        }
      }
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      mediaStreamConstraints = constraints
      element.srcObject = mediaStream
      window.allowMediaStreamSwap(element, constraints, mediaStream, (activeStream, activeConstraints) => {
        mediaStream = activeStream
        mediaStreamConstraints = activeConstraints
        console.log(mediaStream, mediaStreamConstraints)
      })
    } catch (e) {
      console.error(e)
    }
  }

  const startBroadcastWithLevel = async (level, room, name, framerate) => {
    setState(STATE_IS_STARTING)
    const element = document.querySelector('#red5pro-publisher')
    const {
      properties: {
        videoWidth,
        videoHeight,
        videoBR
      }
    } = level
    const deviceId = mediaStreamConstraints.video.deviceId.exact

    const constraints = {
      audio: true,
      video: {
        deviceId,
        width: { exact: videoWidth },
        height: { exact: videoHeight },
        frameRate: { exact: framerate }
      }
    }

    let stream
    const bitrate = videoBR / 1000
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (e) {
      showErrorAlert(e.message)
      return
    }
    mediaStream = stream
    element.srcObject = mediaStream
    if (isDebug) {
      document.querySelectorAll('.debug').forEach(e => e.classList.remove('hidden'))
      document.querySelector('.debug').innerText = name;
    }
    doPublish(mediaStream, room, name, bitrate)
  }

  const determinePublisher = async (mediaStream, room, name, bitrate = 256) => {

    let config = Object.assign({},
      configuration,
      {
        streamMode: configuration.recordBroadcast ? 'record' : 'live'
      },
      getAuthenticationParams(),
      getUserMediaConfiguration());

    const streamNameToUse = isTranscode ? `${name}_1` : name
    let rtcConfig = Object.assign({}, config, {
      protocol: getSocketLocationFromProtocol().protocol,
      port: getSocketLocationFromProtocol().port,
      bandwidth: {
        video: bitrate
      },
      app: `live/${room}`,
      streamName: streamNameToUse
    });

    if (isSM) {
      let connectionParams = rtcConfig.connectionParams ? rtcConfig.connectionParams: {}
      const payload = await window.streamManagerUtil.getOrigin(rtcConfig.host, rtcConfig.app, name, isTranscode)
      const { scope, serverAddress } = payload
      rtcConfig = {...rtcConfig, ...{
        app: 'streammanager',
        connectionParams: {...connectionParams, ...{
          host: serverAddress,
          app: scope
        }}
      }}
    }
    console.log('PUBLISH', streamNameToUse, rtcConfig)
    var publisher = new red5prosdk.RTCPublisher()
    return await publisher.initWithStream(rtcConfig, mediaStream)
  }

  const doPublish = async (stream, room, name, bitrate = 256) => {
    try {
      const streamNameToUse = isTranscode ? `${name}_1` : name

      targetPublisher = await determinePublisher(stream, room, name, bitrate)
      targetPublisher.on('*', onPublisherEvent)
      await targetPublisher.publish(streamNameToUse)
      onPublishSuccess(targetPublisher)
      setPublishingUI(name)
    } catch (error) {
      var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
      console.error('[Red5ProPublisher] :: Error in publishing - ' + jsonError);
      console.error(error);
      onPublishFail(jsonError);
    }
  }

  function unpublish () {
    forceClose = true
    if (hostSocket !== undefined)  {
      hostSocket.close()
    }
    return new Promise(function (resolve, reject) {
      var publisher = targetPublisher;
      publisher.unpublish()
        .then(function () {
          onUnpublishSuccess();
          resolve();
        })
        .catch(function (error) {
          var jsonError = typeof error === 'string' ? error : JSON.stringify(error, 2, null);
          onUnpublishFail('Unmount Error ' + jsonError);
          reject(error);
        });
    });
  }

  // Kick off.
  if (isTranscode) {
    setState(STATE_TRANSCODE)
  } else {
    setState(STATE_SETUP)
  }
  startPreview()

  var shuttingDown = false;
  function shutdown () {
    forceClose = true
    if (shuttingDown) return;
    shuttingDown = true;
    function clearRefs () {
      if (targetPublisher) {
        targetPublisher.off('*', onPublisherEvent);
      }
      targetPublisher = undefined;
    }
    unpublish().then(clearRefs).catch(clearRefs);
    window.untrackBitrate(bitrateTrackingTicket);
  }
  window.addEventListener('beforeunload', shutdown);
  window.addEventListener('pagehide', shutdown);

  var streamsList = [];
  const bottomRowLimit = 4;
  //var subscribersEl = document.getElementById('subscribers');
  //put the whole fn below in a for loop (2 thru 8 or w/e) and have the 'viewer' below be 'viewer'+i
  //for(j = 2; j < 9; j++){ //tab everything below over 1 tab
  var bottomSubscribersEl = document.getElementById('bottomViewers');
  var sideSubscribersEl = document.getElementById('sideViewers');

  function positionExisting (list) {
    list.forEach((name, index) => {
      const elementContainer = document.getElementById(window.getConferenceSubscriberElementContainerId(name))
      if  (elementContainer && index < bottomRowLimit) {
        if (elementContainer.parentNode && elementContainer.parentNode !== bottomSubscribersEl) {
          elementContainer.parentNode.removeChild(elementContainer)
          bottomSubscribersEl.appendChild(elementContainer)
        }
      } else if (elementContainer) {
        if (elementContainer.parentNode && elementContainer.parentNode !== sideSubscribersEl) {
          elementContainer.parentNode.removeChild(elementContainer)
          sideSubscribersEl.appendChild(elementContainer)
        }
      }
    })
  }

  function relayout () {
    const nonPublishers = streamsList.filter(name => name !== streamName)
    positionExisting(nonPublishers)
    //    sweep(streamsList, bottomSubscribersEl)
    //    sweep(streamsList, sideSubscribersEl)
    if (bottomSubscribersEl.children.length >= bottomRowLimit) {
      bottomSubscribersEl.classList.add('subscribers-full')
      document.querySelectorAll('red5pro-subscriber').forEach(el => el.classList.add('red5pro-subscriber-full'))
    } else {
      bottomSubscribersEl.classList.remove('subscribers-full')
      document.querySelectorAll('red5pro-subscriber').forEach(el => el.classList.remove('red5pro-subscriber-full'))
    }
  }

  function sweep (list, container) {
    // Brute force cleanup.
    const r = /red5pro-subscriber-(.*)-container/
    const elements = Array.prototype.slice.call(container.children)
    const errantNames = []
    const errant = elements.filter(e => {
      const result = r.exec(e.id)
      if (result && result.length > 1) {
        errantNames.push(result[1])
        return list.indexOf(result[1]) === -1
      }
      return false
    })
    window.ConferenceSubscriberUtil.removeAll(errantNames)
    errant.forEach(e => {
      if (e.parentNode) {
        try {
          e.parentNode.removeChild(e)
        } catch (e) {}
      }
    })
    // console.log('ERRANT SWEEP', errantNames)
  }

  function processStreams (list, previousList, roomName, exclusion) {
    console.log('TEST', `To streams: ${list}`)
    var nonPublishers = list.filter(function (name) {
      return name !== exclusion;
    });
    var existing = nonPublishers.filter((name, index, self) => {
      return (index == self.indexOf(name) && previousList.indexOf(name) !== -1)
    })
    var toAdd = nonPublishers.filter(function (name, index, self) {
      return (index == self.indexOf(name) && previousList.indexOf(name) === -1)
    })
    var toRemove = previousList.filter((name, index, self) => {
      return (index == self.indexOf(name) && list.indexOf(name) === -1)
    })
    console.log('TEST', `To add: ${toAdd}`)
    console.log('TEST', `To remove: ${toRemove}`)
    window.ConferenceSubscriberUtil.removeAll(toRemove)
    streamsList = list

    positionExisting(existing)
    let lastIndex = existing.length
    var subscribers = toAdd.map(function (name, index) {
      const parent = lastIndex++ < bottomRowLimit ? bottomSubscribersEl : sideSubscribersEl
      return new window.ConferenceSubscriberItem(name, parent, index, relayout);
    });
    relayout()

    var i, length = subscribers.length - 1;
    var sub;
    for(i = 0; i < length; i++) {
      sub = subscribers[i];
      sub.next = subscribers[sub.index+1];
    }
    if (subscribers.length > 0) {
      var baseSubscriberConfig = Object.assign({},
        configuration,
        {
          protocol: getSocketLocationFromProtocol().protocol,
          port: getSocketLocationFromProtocol().port
        },
        getAuthenticationParams(), 
        {
          app: `live/${roomName}`
        });
      subscribers[0].execute(baseSubscriberConfig);
    }
  }

})(this, document, window.red5prosdk);

