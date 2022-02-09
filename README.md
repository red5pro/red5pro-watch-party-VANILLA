# red5pro-watch-party

Watch Party example project for customer demo.

# Query Params

The demo can be extended to support Stream Manager and Transcoding integration. In order to enable these features, you can specify the following query params:

* `host` : The domain name endpoint that the Stream Manager resides. (e.g., `watch-party-test-sm.red5.net`)
* `sm` : Flag to use Stream Manager requests for Origins and Edges. `true` or `false` (or do not include for `false`).
* `transcode` : Flag to incorporate posting a provision and using Transcoding when broadcasting. `true` or `false` (or do not include for `false`). 
* `smToken` : The Stream Manager access token value required when using Transcoding.

Example:

_When running this frontend under localhost at port 8001:_

```
http://localhost:8001/?debug=true&host=watch-party-test-sm.red5.net&sm=true&smToken=abc123&transcode=true
```

> There is an optional `debug` query param as well, which will simply display the stream name over each subscriber for ease in debugging purposes.