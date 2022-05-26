((window, faceapi) => {

  const drawCircle = (context, { x, y }) => {
    context.fillStyle = "#FF0000"
    context.beginPath()
    context.arc(x, y - 4, 12, 0, 2 * Math.PI)
    context.fill()
  }

  const mtcnnForwardParams = {
    // number of scaled versions of the input image passed through the CNN
    // of the first stage, lower numbers will result in lower inference time,
    // but will also be less accurate
    maxNumScales: 10,
    // scale factor used to calculate the scale steps of the image
    // pyramid used in stage 1
    scaleFactor: 0.709,
    // the score threshold values used to filter the bounding
    // boxes of stage 1, 2 and 3
    scoreThresholds: [0.6, 0.7, 0.7],
    // mininum face size to expect, the higher the faster processing will be,
    // but smaller faces won't be detected
    minFaceSize: 200
  }

  const inputSize = 224
  const scoreThreshold = 0.5
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
  const doTrack = async (video, canvas, flip) => {
    //    console.log('detect', 'doTrack')
    const rerun = () => {
      //      console.log('detect', 'rerun')
      let t = setTimeout(() => {
        clearTimeout(t)
        doTrack(video, canvas, flip)
      }, 200)
    }

    let retry = setTimeout(() => {
      console.log('detect', 'retry... may have stalled.')
      clearTimeout(retry)
      rerun()
    }, 3000)
    if (!video.paused && !video.ended && video.currentTime > 5 && !!faceapi.nets.tinyFaceDetector.params) {
      try {
        faceapi.detectSingleFace(video, options).withFaceLandmarks().then(result => {
          //          console.log('detect', 'results')
          clearTimeout(retry)
          if (result) {
            canvas.style.width = `${video.clientWidth}px`
            canvas.style.height = `${video.clientHeight}px`
            const nose = result.landmarks.getNose()
            //          console.log('NOSE', nose)
            const dims = faceapi.matchDimensions(canvas, video, true)
            const resizedResult = faceapi.resizeResults(result, dims)
            //faceapi.draw.drawDetections(canvas, resizedResult)
            //faceapi.draw.drawFaceLandmarks(canvas, resizedResult)
            let obj = nose[6]
            drawCircle(canvas.getContext("2d"), obj)
          }
          rerun()
        }).catch(e => {
          clearTimeout(retry)
          console.error(e)
          rerun()
        })
      } catch (e) {
        clearTimeout(retry)
        console.error(e)
        rerun()
      }
    }
    /*
    if (!video.paused && !video.ended && !!faceapi.nets.mtcnn.params) {
      try {
const mtcnnResults = await faceapi.mtcnn(video, mtcnnForwardParams)
faceapi.drawDetection('overlay', mtcnnResults.map(res => res.faceDetection), { withScore: false })
faceapi.drawLandmarks('overlay', mtcnnResults.map(res => res.faceLandmarks), { lineWidth: 4, color: 'red' })
      } catch (e) {
        console.error(e)
      }
    }
    */
  }

  (async () => {
    await faceapi.nets.tinyFaceDetector.loadFromUri('static/lib/face-api/weights')
    await faceapi.loadMtcnnModel('static/lib/face-api/weights')
    await faceapi.loadFaceRecognitionModel('static/lib/face-api/weights')
    await faceapi.loadFaceLandmarkModel('static/lib/face-api/weights')
  })()

  window.doDetect = doTrack

})(this, window.faceapi)

