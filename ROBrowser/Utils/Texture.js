/**
 * Utils/Texture.js
 *
 * WebGL Helper function
 *
 * Trying to define here some functions related to webgl.
 *
 * This file is part of ROBrowser, Ragnarok Online in the Web Browser (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */
 
define(['Loaders/Targa'], function( Targa )
{
	"use strict";
	

	/**
	 * Texture Constructor
	 *
	 * @param {string|object} data
	 * @param {function} oncomplete callback
	 */
	function Texture( data, oncomplete )
	{
		// Possible missing textures on loaders
		if( !data ){
			return;
		}

		var args = Array.prototype.slice.call(arguments, 2);

		// TGA Support
		if( data instanceof ArrayBuffer ) {
			var tga = new Targa();
			tga.load( new Uint8Array(data) );
			args.unshift(true);
			oncomplete.apply( tga.getCanvas(), args );
			return;
		}

		// Regular images
		var img = new Image();
		img.src = data;
		img.onload = function OnLoadClosure(){

			// Clean up blob
			if( data.match(/^blob\:/) ){
				URL.revokeObjectURL(data);
			}

			var canvas = document.createElement('canvas');
			var ctx    = canvas.getContext('2d');

			canvas.width  = this.width;
			canvas.height = this.height;

			ctx.drawImage( this, 0, 0, this.width, this.height );
			RemoveMagenta( canvas );

			args.unshift( true );
			oncomplete.apply( canvas, args );
		};
	}


	/**
	 * Remove magenta pixels from image
	 *
	 * @param {HTMLElement} canvas
	 */
	function RemoveMagenta( canvas )
	{
		var ctx, imageData, data;
		var count, i;

		ctx       = canvas.getContext('2d');
		imageData = ctx.getImageData( 0, 0, canvas.width, canvas.height );
		data      = imageData.data;
		count     = data.length;

		for ( i=0; i<count; i+=4 ) {
			if ( data[i+0] > 230 && data[i+1] < 20 && data[i+2] > 230 ) {
				data[i+0] = data[i+1] = data[i+2] = data[i+3] = 0;
			}
		}

		ctx.putImageData( imageData, 0, 0 );
	}


	/**
	 * Export
	 */
	return Texture;
});