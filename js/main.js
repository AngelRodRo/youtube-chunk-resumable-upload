/*
Copyright 2013 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

(function() {
  var GOOGLE_PLUS_SCRIPT_URL = 'https://apis.google.com/js/client:plusone.js';
  var CHANNELS_SERVICE_URL = 'https://www.googleapis.com/youtube/v3/channels';
  var VIDEOS_UPLOAD_SERVICE_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet';
  var VIDEOS_SERVICE_URL = 'https://www.googleapis.com/youtube/v3/videos';
  var INITIAL_STATUS_POLLING_INTERVAL_MS = 15 * 1000;

  var accessToken;

  window.oauth2Callback = function(authResult) {
    if (authResult['access_token']) {
      accessToken = authResult['access_token'];

      $.ajax({
        url: CHANNELS_SERVICE_URL,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + accessToken
        },
        data: {
          part: 'snippet',
          mine: true
        }
      }).done(function(response) {
        $('#channel-name').text(response.items[0].snippet.title);
        $('#channel-thumbnail').attr('src', response.items[0].snippet.thumbnails.default.url);

        $('.pre-sign-in').hide();
        $('.post-sign-in').show();
      });
    }
  };

  function initiateUpload(e) {
    e.preventDefault();

    var file = $('#file').get(0).files[0];
    if (file) {
      $('#submit').attr('disabled', true);

      var metadata = {
        snippet: {
          title: $('#title').val(),
          description: $('#description').val(),
          categoryId: 22
        }
      };

      $.ajax({
        url: VIDEOS_UPLOAD_SERVICE_URL,
        method: 'POST',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'x-upload-content-length': file.size,
          'x-upload-content-type': file.type
        },
        data: JSON.stringify(metadata)
      }).done(function(data, textStatus, jqXHR) {

          var options = {};
          options.url = jqXHR.getResponseHeader('Location');
          options.start = 0;

          var uploader = new ChunkedUploader(file,options);
          uploader.start();

      });
    }
  }


  function ChunkedUploader(file, options) {
      if (!this instanceof ChunkedUploader) {
          return new ChunkedUploader(file, options);
      }

      this.file = file;

      this.options = { url: options.url};

      this.file_size = this.file.size;
      this.chunk_size = (1024 * 256); // 256KB
      this.range_start = 0;
      this.range_end = this.chunk_size;

      if ('mozSlice' in this.file) {
          this.slice_method = 'mozSlice';
      }
      else if ('webkitSlice' in this.file) {
          this.slice_method = 'webkitSlice';
      }
      else {
          this.slice_method = 'slice';
      }

      this.upload_request = new XMLHttpRequest();
      this.upload_request.onload = this._onChunkComplete;
      this.file_uploaded = 0;
  }
  ChunkedUploader.prototype = {

  // Internal Methods __________________________________________________

      _upload: function() {
          var self = this,
              chunk;

          // Slight timeout needed here (File read / AJAX readystate conflict?)
          setTimeout(function() {
              // Prevent range overflow
              if (self.range_end > self.file_size) {
                  self.range_end = self.file_size;
              }

              chunk = self.file[self.slice_method](self.range_start, self.range_end);
              self.file_uploaded+= chunk.size;
              console.log(self.file_uploaded);
              console.log( (self.file_uploaded/self.file_size)*100 );
              var ajax = $.ajax({
                  url: self.options.url,
                  method: 'PUT',
                  contentType: this.file.type,
                  headers: {
                      'Content-Range': 'bytes ' + self.range_start + '-' + (self.range_end-1) + '/' + self.file_size
                  },
                  processData: false,
                  data: chunk,
                  complete: function(res){
                      if (self.range_end === self.file_size) {
                          //self._onUploadComplete();
                          return;
                      }

                      // Update our ranges
                      self.range_start = self.range_end;
                      self.range_end = self.range_start + self.chunk_size;

                      // Continue as long as we aren't paused
                      if (!self.is_paused) {
                          self._upload();
                      }
                      console.log(res);
                  }
              });

              // TODO
              // From the looks of things, jQuery expects a string or a map
              // to be assigned to the "data" option. We'll have to use
              // XMLHttpRequest object directly for now...
              /*$.ajax(self.options.url, {
                  data: chunk,
                  type: 'PUT',
                  mimeType: 'application/octet-stream',
                  headers: (self.range_start !== 0) ? {
                      'Content-Range': ('bytes ' + self.range_start + '-' + self.range_end + '/' + self.file_size)
                  } : {},
                  success: self._onChunkComplete
              });*/
          }, 20);
      },

  // Event Handlers ____________________________________________________

      _onChunkComplete: function() {
          // If the end range is already the same size as our file, we
          // can assume that our last chunk has been processed and exit
          // out of the function.
          if (this.range_end === this.file_size) {

              alert('Archivo subido exitosamente')
                //this._onUploadComplete();
              return;
          }

          // Update our ranges
          this.range_start = this.range_end;
          this.range_end = this.range_start + this.chunk_size;

          // Continue as long as we aren't paused
          if (!this.is_paused) {
              this._upload();
          }
      },

  // Public Methods ____________________________________________________

      start: function() {
          this._upload();
      },

      pause: function() {
          this.is_paused = true;
      },

      resume: function() {
          this.is_paused = false;
          this._upload();
      }
  };


  function checkVideoStatus(videoId, waitForNextPoll) {
    $.ajax({
      url: VIDEOS_SERVICE_URL,
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken
      },
      data: {
        part: 'status,processingDetails,player',
        id: videoId
      }
    }).done(function(response) {
      var processingStatus = response.items[0].processingDetails.processingStatus;
      var uploadStatus = response.items[0].status.uploadStatus;

      $('#post-upload-status').append('<li>Processing status: ' + processingStatus + ', upload status: ' + uploadStatus + '</li>');

      if (processingStatus == 'processing') {
        setTimeout(function() {
          checkVideoStatus(videoId, waitForNextPoll * 2);
        }, waitForNextPoll);
      } else {
        if (uploadStatus == 'processed') {
          $('#player').append(response.items[0].player.embedHtml);
        }

        $('#post-upload-status').append('<li>Final status.</li>');
      }
    });
  }

  $(function() {
    $.getScript(GOOGLE_PLUS_SCRIPT_URL);

    $('#upload-form').submit(initiateUpload);
  });
})();


Number.prototype.formatBytes = function() {
    var units = ['B', 'KB', 'MB', 'GB', 'TB'],
        bytes = this,
        i;

    for (i = 0; bytes >= 1024 && i < 4; i++) {
        bytes /= 1024;
    }

    return bytes.toFixed(2) + units[i];
}
