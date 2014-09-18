'use strict';

module.exports = function(grunt) {

  grunt.initConfig({

    concat: {
      polyfills: {
        src: [
          'lib/document-register-element/build/document-register-element.max.js',
          'src/CustomEvent.js',
          'src/DOMTokenList.js',
          'src/ShadowDOM.js'
        ],
        dest: 'dist/bosonic-platform.js'
      }
    },

    watch: {
      platform: {
        files: ['src/*.js'],
        tasks: ['concat']
      }
    }

  });

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');

  grunt.registerTask('default', ['concat', 'watch']);

};