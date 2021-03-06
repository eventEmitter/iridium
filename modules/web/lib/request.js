


	var   Class 		= iridium( "class" )
		, Events 		= iridium( "events" )
		, log 			= iridium( "log" )
		, argv 			= iridium( "util" ).argv
		, debug 		= argv.has( "trace-all" ) || argv.has( "trace-webservice" );

	var Cookie 			= require( "./cookie" )
		, formidable 	= require( "../node_modules/formidable" );

	var   url 			= require( "url" )
		, querystring 	= require( "querystring" );




	module.exports = new Class( {
		inherits: Events

		, __headers: []
		, __language: null
		, __fileCallbacks: []
		, __fileReady: false
		, __hasFiles: false


		, get pathname(){
			try{		
				return decodeURIComponent( this.getUri().pathname || "" );
			} catch ( e ){
				//log.trace( e );
				//log.info(  this.getUri().pathname );
				return this.getUri().pathname;
			}
		}

		, set pathname( newPath ){
			this.__uri.pathname = newPath;
		}

		, get hostname(){			
			return this.getUri().hostname;
		}

		, get url(){
			return this.__request.url;
		}

		, get query(){	
			return this.getUri().query;
		}	

		, get querystring(){	
			return  url.parse( this.__request.url ).query;
		}

		, set query( query ){
			this.getUri().query = query;
		}

		, get language(){
			return this.__getRequestLanguage();
		}

		, set language( newLang ){
			this.__language = newLang;
		}


		, get method(){
			return this.__method.toLowerCase();
		}


		, get ip(){
			return this.getHeader( "x-forwarded-for" ) || this.__request.connection.remoteAddress || "";
		}


		, init: function( options ){
			this.__request = options.request;
			this.__resources = options.resources;
			this.__method = this.__request.method;

			// remove double slashes
			this.__request.url = this.__request.url.replace( /\/{2,}/gi, "/" );

			this.__collectData();
			if ( !this.__request.headers ) this.__request.headers = {};

			this.on( "listener", function( evt, fn ){
				if ( evt === "end" && this.__ended ){
					fn();
				}
			}.bind( this ) );

			// use fromidable for form parsing
			if ( this.getHeader( "x-iridium-upload" ) === "1" ){
				this.__hasFiles = true;
				new formidable.IncomingForm().parse( this.__request, function( err, fields, files ){
					this.__files = files;
					this.__fileReady = true;
					this.__fileCallbacks.forEach( function( cb ){
						cb( files );
					}.bind( this ) );
				}.bind( this ) ).encoding = "binary";
			}
		}

		, getRequest: function(){
			return this.__request;
		}

		, hasEnded: function(){
			return !!this.__ended;
		}


		, getFiles: function(){
			return this.__files || null;
		}

		, getFilesAsync: function( callback ){
			if ( this.__hasFiles ){
				if ( this.__fileReady ) callback( this.__files || null );
				else  this.__fileCallbacks.push( callback );
			}
			else callback( null );
		}

		, getPostData: function( parsed ){
			if ( this.__ended && this.__postData ){
				if ( parsed ){
					if ( debug ) log.info( "post data:", this ), log.dir( querystring.parse( this.__postData.toString() ) );
					return querystring.parse( this.__postData.toString() );
				}
				else {
					if ( debug ) log.info( "post data:", this ), log.dir( this.__postData );
					return this.__postData;
				}
			}
			else return null;
		}

		, __collectData: function(){
			if ( this.__request.method === "POST" || this.__request.method === "PATCH" || this.__request.method === "PUT" ){
				var data, data2;
				this.__request.on( "data", function( chunk ){
					if ( !data ) data = chunk;
					else {
						data2 = new Buffer( data.length + chunk.length );
						data.copy( data2 );
						chunk.copy( data2, data.length );
						data = data2;
					}
				}.bind( this ) );

				this.__request.on( "end", function(){
					this.__postData = data;
					this.__ended = true;
					this.emit( "end" );
				}.bind( this ) );
			}
		}

		, hasQueryParameter: function( key, value ){
			var query = this.query;
			if ( query ){
				if ( value !== undefined && query.hasOwnProperty( key ) && query[ key ] == value ) return true;
				else if ( value === undefined && query.hasOwnProperty( key ) ) return true;
			}
			return false;
		}

		, addTrailingSlash: function( input ){
			if ( typeof input === "string" ){
				return input + input[ input.length - 1 ] === "/" ? "" : "/";
			}
			throw new Error( "cannnot add slash to non string: " + input );
		}

		, getCookie: function( cookiename ){
			return ( new RegExp( cookiename + "=([^;]+)(?:;|$)", "gi" ).exec( this.getHeader( "cookie" ) ) || [ null, null ] )[ 1 ];
		}

		, getHeader: function( name, parsed ){
			if ( this.__request.headers[ name ] ){
				if ( parsed ){
					return this.__parseHeader( this.__request.headers[ name ] )
				}
				else {
					return this.__request.headers[ name ]
				}
			}
			return null;
		}

		, hasHeader: function( name ){
			return !!this.__request.headers[ name ];
		}
		
		, getUri: function(){
			if ( ! this.__uri ) this.__uri = url.parse( "http://" + this.__request.headers.host + this.__request.url, true );
			return this.__uri;
		}

		, __parseHeader: function( header ){
			var parts = header.split( "," ).map( function( part ){
				var items = /^([a-z0-9\.\+\*]+)[\/\-]?([a-z0-9\.\+\*]*)\;?q?=?([0-9\.]*)$/gi.exec( part );
				
				return {
					  value: 		items && items[ 1 ] ? items[ 1 ].toLowerCase() : ""
					, value2: 		items && items[ 2 ] ? items[ 2 ].toLowerCase() : ""
					, q: 			items && items[ 3 ] ? items[ 3 ] : 1
				};
			} ).sort( function( a, b ){ return a.q > b.q ? -1 : 1 } );
			return parts.length > 0 ? parts: null;
		}

		, __getRequestLanguage: function(){
			if ( this.__language === null ){
				var lang = /^\/([a-z]{2})\//gi.exec( this.pathname )
					, cookie = this.getCookie( "lang" ), langHeader;

				// lang from url
				if ( lang ) this.__language = lang[ 1 ].toLowerCase();
				else {
					// lang from cookie
					if ( cookie && this.__resources.supportsLanguage( cookie ) ) this.__language = cookie;
					else {
						// lang from header
						langHeader = this.getHeader( "accept-language", true );

						if ( langHeader ){
							for ( var i = 0, l = langHeader.length; i < l; i++ ){
								if ( this.__resources.supportsLanguage( langHeader[ i ].value ) ){
									this.__language = langHeader[ i ].value;
									break;
								}
							}
						}

						// default
						if ( this.__language === null ){
							this.__language = this.__resources.defaultLanguage;
						}
					}
				}

				if ( this.__language !== cookie ){
					// set cookie
					this.emit( "cookie", new Cookie( { name: "lang", value: this.__language, path: "/", httponly: true, maxage: 315360000 } ) );
				}
			}

			// overrride language?
			return argv.get( "override-language" ) || this.__language; 
		}
	} );