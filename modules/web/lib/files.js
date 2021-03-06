
	var   Class 		= iridium( "class" )
		, Events 		= iridium( "events" )
		, util 			= iridium( "util" )
		, log 			= iridium( "log" )
		, argv 			= util.argv
		, debug 		= argv.has( "trace-all" ) || argv.has( "trace-webservice" );;


	var	  fs 			= require( "fs" )
		, path 			= require( "path" )
		, crypto 		= require( "crypto" )
		, zlib 			= require( "zlib" );


	var   hogan			= require( "../dep/hogan.js/lib/hogan.js" );






	var Files = module.exports = new Class( {
		inherits: Events

		// theweb root folder
		, __path: ""

		// files
		, __files: {}

		// depency graph
		, __graph: {}

		// depency graph for the includes
		, __includeGraph: {}

		// client templates
		, __clientTemplates: {}



		, init: function( options ){
			this.__path = path.resolve( options.path );

			// did we get lanaguage data and constants?
			if ( options.lang ) 		this.__lang 		= options.lang;
			if ( options.navigation )	this.__navigation 	= options.navigation;
			if ( options.constants ) 	this.__constants 	= options.constants;

			// go
			fs.exists( this.__path, function( exists ){
				if ( exists ) {
					this.__load( this.__path );
					this.__watch();
				}
				else {
					throw new Error( "cannot load web files: the path [" + this.__path + "] does not exist!" );
				}
			}.bind( this ) );		
		}



		, exists: function( path ){
			return this.__files.hasOwnProperty( path );
		}


		, get: function( path ){
			return this.__files.hasOwnProperty( path ) ? this.__files[ path ] : null;
		}


		, getFileTreePointer: function(){
			return this.__files;
		}



		, __watch: function( path ){
			/*path = path || this.__path;

			fs.stat( path, function( err, stats ){
				if ( err ) throw err;

				if( stats.isDirectory() ){
					fs.watch( path, function( event, file ){
						this.__handleFileChange( event, path + "/" + file );
					}.bind( this ) );

					if ( debug ) log.debug( "added watch for directory [" + path + "] ...", this );

					fs.readdir( path, function( err, filelist ){
						if ( err ) throw err;

						var i = filelist.length;
						while( i-- ) this.__watch( path + "/" + filelist[ i ] );
					}.bind( this ) );
				}
			}.bind( this ) );*/
		}

 
		, __loadFile: function( filePath, callback ){
			var webPath = filePath.substr( this.__path.length )
				, ext = webPath.substr( webPath.lastIndexOf( "." ) + 1 );

			fs.readFile( filePath, function( err, file ){
				if ( err ) throw err;

				if ( this.__files[ webPath ] ){
					this.__files[ webPath ].file = this.__files[ webPath ].binary ? file : file.toString( "utf-8" ) ;
					this.__files[ webPath ].length = file.length;
					this.__files[ webPath ].etag = crypto.createHash( "sha1" ).update( file ).digest( "hex" );
					this.__files[ webPath ].time = Date.now();


				}
				else {
					this.__files[ webPath ] = { 
						file: util.mime.isBinary( ext ) ? file : file.toString( "utf-8" )
						, length: file.length
						, extension: ext
						, binary: util.mime.isBinary( ext )
						, type: util.mime.get( ext )
						, path: filePath
						, time: Date.now()
						, etag: crypto.createHash( "sha1" ).update( file ).digest( "hex" )
					};

					this.emit( "change", {
						path: webPath
						, action: "set"
						, file: this.__files[ webPath ]
					} );
				}

				// DIRECTORY INDEX
				if ( /\/index\.html$/gi.test( webPath ) ){
					var idxPath = webPath.substr( 0, webPath.lastIndexOf( "/" ) ) + "/" ;

					this.__files[ idxPath ] = this.__files[ webPath ];							
					this.emit( "change", {
						path: idxPath
						, action: "set"
						, file: this.__files[ idxPath ]
					} );
				}

				callback();
			}.bind( this ) );
		}


		, __handleFileChange: function( event, path ){
			var webPath = path.substr( this.__path.length );

			switch ( event ){

				case "change":
					fs.stat( path, function( err, stats ){
						if ( err ) throw err;

						if ( stats.isDirectory() ){
							this.__load( path );
						}
						else if ( stats.isFile() ){
							this.__loadFile( path, function(){
								this.__compile( [ webPath ] );
							}.bind( this ) );
						}

					}.bind( this ) );
					break;

				case "rename": // aka delete, move, create
					fs.exists( path, function( exists ){
						if ( exists ){
							fs.stat( path, function( err, stats ){
								if ( err ) throw err;

								if ( stats.isDirectory() ){
									this.__load( path );
									this.__watch( path );
								}
								else if ( stats.isFile() ){
									this.__loadFile( path, function(){
										this.__compile( [ webPath ] );
									}.bind( this ) );
								}

							}.bind( this ) );
						}
						else {
							// its a file
							if ( this.__files[ webPath ] ){
								var idxPath = webPath.substr( webPath.lastIndexOf( "/") ) ;
								if ( this.__files[ idxPath ] === this.__files[ webPath ] ){
									this.emit( "change", {
										path: idxPath
										, action: "remove"
									} );
									// rm directoy index
									delete this.__files[ webPath.substr( webPath.lastIndexOf( "/") ) ];
								}
								this.emit( "change", {
									path: webPath
									, action: "remove"
								} );
								delete this.__files[ webPath ];
							}
							else {
								var keys = Object.keys( this.__files ), i = keys.length;

								while( i-- ){
									if ( keys[ i ].indexOf( webPath ) === 0 ){
										this.emit( "change", {
											path: keys[ i ]
											, action: "remove"
										} );
										delete this.__files[ keys[ i ] ];
									} keys[ i ] 
								}
							}

							this.__compile( [] );
						}
					}.bind( this ) );
					break;
				default: 
					log.warn( "uncaught fs.watch event [" + event + "] for file [" + file + "] ...");
			}
		}




		// analyze the depency tree, compile if needed
		, __compile: function( files ){
			if ( process.argv.indexOf( "--debug" ) >= 0 ){
				// dev mode, dont combine files, prepare for clientside module loader
				var i = files.length;
				while( i-- ){
					if ( this.__files[ files[ i ] ].extension === "mjs" ){
						// extend file so its suitable for the webloadr
						this.__files[ files[ i ] ].file = this.__prepareMJsFile( files[ i ], this.__files[ files[ i ] ].file );
						this.__files[ files[ i ] ].etag = crypto.createHash( "sha1" ).update( this.__files[ files[ i ] ].file ).digest( "hex" );
						this.__files[ files[ i ] ].time = Date.now();
						this.__files[ files[ i ] ].length = Buffer.byteLength( this.__files[ files[ i ] ].file );

						this.emit( "change", {
							path: files[ i ]
							, action: "set"
							, file: this.__files[ files[ i ] ]
						} );
					}
				}
			}
			else {
				// merge modules

				// locate iridium if not already known
				if ( ! this.__iridiumPath ){
					var i = files.length;
					while( i-- ){
						if ( files[ i ].indexOf( "iridium/index.js" ) >= 0 ){
							this.__iridiumPath = files[ i ].substr( 0, files[ i ].length - 9 );
							break;
						}
					}
				}

				// flatten paths, remove comments, get depencies, store them in the tree
				var i = files.length, fileInfo = {};
				while( i-- ){
					if ( this.__files[ files[ i ] ].extension === "mjs" ){
						fileInfo[ files[ i ] ] = this.__flattenMJsFile( files[ i ], this.__files[ files[ i ] ].file );
					}
				}


				// update depency graph
				this.__updateDepencyGraph( fileInfo );

				// compile changed files
				this.__compileMJS();
			}
			

			// add vendor prefixes to css files
			//this.__addVendorPrefixes();

			// compile locales, constants & navigation tags
			log.debug( "compiling locale data ....", this );
			this.__compileLocaleData();


			// do the includes ( slow )
			log.debug( "compiling includes ....", this );
			this.__compileIncludes();


			// do file revisions
			if ( !argv.has( "debug" ) ) this.__doAssetsVersioning();


			// compile templates ( slow )
			log.debug( "compiling hogan temples ....", this );
			this.__compileTemplates();


			// create locales fro templates
			//if ( this.__lang ) this.__compileLocale();


			// create compressed versions of the files
			log.debug( "compressing files ....", this );
			this.__compressFiles( function(){
				// ready :)
				this.emit( "load" );
			}.bind( this ) );
		}




		// enable caching for images, css and js using md5 query parameters
		, __doAssetsVersioning: function(){
			var keys = Object.keys( this.__files )
				, i = keys.length
				, paths = {}
				, reg, result, file, ePath, parts;

			
			i = keys.length;
			while( i-- ){
				file = this.__files[ keys[ i ] ];

				if ( file.extension.toLowerCase() === "mustache" || file.extension.toLowerCase() === "html" || file.extension.toLowerCase() === "tpl" || file.extension.toLowerCase() === "css" ){
					
					// pattern src="" in mustache, html
					reg = /(src=[\"\'])([^\"\']+)([\"\'])/gi;
					while( result = reg.exec( file.file ) ){
						ePath = result[ 2 ];

						// ignore files with protocol specified and files containing dynamic stuff too
						if ( ePath.indexOf( "{" ) === -1 && ePath.indexOf( "?" ) === -1 && ePath.substr( 0, 7 ) !== "http://" && ePath.substr( 0, 8 ) !== "https://" && ePath.substr( 0, 2 ) !== "//" ){
							//parts = //gi.exec( ePath );

							// get path without constancs
							var cleanPath = ePath.replace( /@[a-z0-9]+\([a-z0-9]+\);/, "" );
							if ( cleanPath[ 0 ] === "." ) cleanPath = path.join( keys[ i ].replace( /[^\/]*$/gi, "" ) , ePath.replace( /@[a-z0-9]+\([a-z0-9]+\);/, "" ) );
							
							// file exists ?
							if ( this.__files[ cleanPath ] ){
								file.file = file.file.replace( new RegExp( ( result[ 1 ] + ePath + result[ 3 ] ).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"), "gi" ), result[ 1 ] + ePath + "?__icv=" + this.__files[ cleanPath ].etag + result[ 3 ] );
							}
						}
					}

					// pattern link rel="" href=""  in mustache, html
					reg = /(<link [^>]+ href=[\"\'])([^\"\']+)([\"\'][^>]*>)/gi;
					while( result = reg.exec( file.file ) ){
						ePath = result[ 2 ];
						// ignore files with protocol specified and files containing dynamic stuff too
						if ( ePath.indexOf( "{" ) === -1 && ePath.indexOf( "?" ) === -1 && ePath.substr( 0, 7 ) !== "http://" && ePath.substr( 0, 8 ) !== "https://" && ePath.substr( 0, 2 ) !== "//" ){
							
							// get path without constancs
							var cleanPath = ePath.replace( /@[a-z0-9]+\([a-z0-9]+\);/, "" );
							if ( cleanPath[ 0 ] === "." ) cleanPath = path.join( keys[ i ].replace( /[^\/]*$/gi, "" ) , ePath.replace( /@[a-z0-9]+\([a-z0-9]+\);/, "" ) );
							
							// file exists ?
							if ( this.__files[ cleanPath ] ){
								file.file = file.file.replace( new RegExp( ( result[ 1 ] + ePath + result[ 3 ] ).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"), "gi" ), result[ 1 ] + ePath + "?__icv=" + this.__files[ cleanPath ].etag + result[ 3 ] );
							}
						}
					}

					<!--[if lt IE 9]><script type="text/javascript" src="@constant(staticfiles);/scripts/vendor/html5shiv.js"></script><!
																	src="@constant(staticfiles);/scripts/vendor/html5shiv.js"

					// pattern link url() in css
					reg = /(url\s*\(\s*[\"\']?)([^\)\"\']+)([\"\']?\s*\))/gi;
					while( result = reg.exec( file.file ) ){
						ePath = result[ 2 ];
						// ignore files with protocol specified and files containing dynamic stuff too
						if ( ePath.indexOf( "data:" ) === -1 && ePath.indexOf( "{" ) === -1 && ePath.indexOf( "?" ) === -1 && ePath.substr( 0, 7 ) !== "http://" && ePath.substr( 0, 8 ) !== "https://" && ePath.substr( 0, 2 ) !== "//" ){


							// get path without constancs
							var cleanPath = ePath.replace( /@[a-z0-9]+\([a-z0-9]+\);/, "" );
							if ( cleanPath[ 0 ] === "." ) cleanPath = path.join( keys[ i ].replace( /[^\/]*$/gi, "" ) , cleanPath );
							
							// file exists ?
							if ( this.__files[ cleanPath ] ){
								file.file = file.file.replace( new RegExp( ( result[ 1 ] + ePath + result[ 3 ] ).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1"), "gi" ), result[ 1 ] + ePath + "?__icv=" + this.__files[ cleanPath ].etag + result[ 3 ] );
							}
						}
					}
				}
			}

			


			
		}





		, __compressFiles: function( callback ){
			var keys = Object.keys( this.__files ), l = keys.length * 2, i = keys.length;
			var complete = function(){
				l--;
				if ( l === 0 ) callback();
			}.bind( this );

			while( i-- ){
				( function( file ){
					if ( file.type.indexOf( "utf-8" ) > -1 ){
						zlib.gzip( file.file, function( err, data ){
							if ( ! err ){
								file.gzip = data;
								file.gzipLength = data.length;
							}
							complete();
						}.bind( this ) );
						zlib.gzip( file.file, function( err, data ){
							if ( ! err ){
								file.deflate = data;
								file.deflateLength = data.length;
							}
							complete();
						}.bind( this ) );
					}
					else {						
						complete();
						complete();
					}
				}.bind( this ) )( this.__files[ keys[ i ]] );
			}
		}



		, __addVendorPrefixes: function(){
			var keys = Object.keys( this.__files ), i = keys.length;

			while( i-- ){
				if ( this.__files[ keys[ i ] ].extension.toLowerCase() === "css" ){
					this.__files[ keys[ i ] ].file = CSSPrefixer.fix( this.__files[ keys[ i ] ].file ).debug;
					this.__files[ keys[ i ] ].length = Buffer.byteLength( this.__files[ keys[ i ] ].file );
					this.__files[ keys[ i ] ].etag = crypto.createHash( "sha1" ).update( this.__files[ keys[ i ] ].file ).digest( "hex" );
				}
			}
		}



		, __compileIncludes: function(){
			var keys = Object.keys( this.__files ), i = keys.length, current, reg, hit;

			this.__includeGraph = {};


			// collect depencies
			while( i-- ){
				current = this.__files[ keys[ i ] ];
				reg = /@iridium\s*\(\s*([^\)]+)\s*\)\s*\;/g;
				hit = false;
				
				if ( !current.isBinary ){
					// reset
					//console.log( !!current.original, current.time, current.originalTime, current.path );
					// reset to original unless the file was reloaded 
					if ( current.original && current.time === current.originalTime ) current.file = current.original;

					while( result = reg.exec( this.__files[ keys[ i ] ].file ) ){
						mypath = result[ 1 ].substr( 0, 1 ) === "/" ? result[ 1 ] : path.join( path.dirname( keys[ i ] ), result[ 1 ] );

						if ( this.__files[ mypath ] ){

							if ( ! this.__includeGraph[ keys[ i ] ] ) this.__includeGraph[ keys[ i ] ] = { includedBy: [], includes: [], includeIds: [] };
							if ( ! this.__includeGraph[ mypath ] ) this.__includeGraph[ mypath ] = { includedBy: [], includes: [], includeIds: [] };

							this.__includeGraph[ keys[ i ] ].includes.push( mypath );
							this.__includeGraph[ keys[ i ] ].includeIds.push( result[ 1 ] );
							this.__includeGraph[ mypath ].includedBy.push( keys[ i ] );

							// preserve the originals
							if ( !hit ){
								hit = true;
								this.__files[ keys[ i ] ].original = this.__files[ keys[ i ] ].file;
								this.__files[ keys[ i ] ].originalTime = this.__files[ keys[ i ] ].time;

								this.__files[ mypath ].original = this.__files[ mypath ].file;
								this.__files[ mypath ].originalTime = this.__files[ mypath ].time;
							}
						}
						else {
							log.error( "cannot resolve @iridium require from [" +keys[ i ] + "] to [" + mypath + "]!", this );
						}					
					}
				}
			}

			// compile
			keys = Object.keys( this.__includeGraph ), i = keys.length;
			while( i-- ){
				current = this.__includeGraph[ keys[ i ] ];
				if ( current.includedBy.length === 0 && current.includes.length > 0 ){
					// a toplevel module
					this.__compileIncludeFile( keys[ i ], [] ) ;
				}
			}
		}



		, __compileIncludeFile: function( file, parents, lang  ){
			var i = this.__includeGraph[ file ].includes.length;

			// toplevel file
			if ( i === 0 ) {
				if ( !lang ) return this.__files[ file ] ? this.__files[ file ].file: "Exception: include file [" + file + "] does not exist!";
				else return this.__files[ file ] ? this.__files[ file ].rawTemplates[ lang ]: "Exception: include file [" + file + "] does not exist!";
			}

			// dont do loops
			if ( parents.indexOf( file ) >= 0 ) {
				return "Exception: include loop for include [" + file + "] !";
			}
			parents.push( file );

			while( i-- ){
				this.__files[ file ].file = this.__files[ file ].file.replace( new RegExp( "@iridium\\s*\\(\\s*" + this.__includeGraph[ file ].includeIds[ i ].replace( /\//g, "\\/" ) + "\\s*\\)\\s*\\;", "gi" ), this.__compileIncludeFile( this.__includeGraph[ file ].includes[ i ], util.clone( parents ) ) );
				
				if ( this.__files[ file ].rawTemplates ){
					Object.keys( this.__files[ file ].rawTemplates ).forEach( function( lang ){
						this.__files[ file ].rawTemplates[ lang ] = this.__files[ file ].rawTemplates[ lang ].replace( new RegExp( "@iridium\\s*\\(\\s*" + this.__includeGraph[ file ].includeIds[ i ].replace( /\//g, "\\/" ) + "\\s*\\)\\s*\\;", "gi" ), this.__compileIncludeFile( this.__includeGraph[ file ].includes[ i ], util.clone( parents ), lang ) );
					}.bind( this ) );
				}
			}

			this.__files[ file ].etag = crypto.createHash( "sha1" ).update( this.__files[ file ].file ).digest( "hex" );
			this.__files[ file ].length = Buffer.byteLength( this.__files[ file ].file );
			if ( !lang ) return this.__files[ file ].file;
			else return this.__files[ file ].rawTemplates[ lang ];
		}





		, __compileLocaleData: function(){
			var keys = Object.keys( this.__files ), i = keys.length, current, version, reg, result, navreg;
			
			while( i-- ){
				current = this.__files[ keys[ i ] ];

				if ( current.extension === "tpl" || current.extension === "mustache" ){
					current.isTemplate = true;
					var webPath = current.path.substr( iridium.app.root.length + 3 );

					// constants ...
					if ( this.__constants ){
						reg = /@constant\s*\(\s*([^\)]+)\s*\)\s*;/gi;
						
						while ( result = reg.exec( current.file ) ){
							if ( this.__constants[ result[ 1 ].trim() ] !== undefined ){
								current.file = current.file.replace( new RegExp( "@constant\\s*\\(\\s*" + result[ 1 ] + "\\s*\\)\\s*;", "gi" ), this.__constants[ result[ 1 ].trim() ] );
							}
							else{
								current.file = current.file.replace( new RegExp( "@constant\\s*\\(\\s*" + result[ 1 ] + "\\s*\\)\\s*;", "gi" ), "constant:" + result[ 1 ] );
								log.warn( "missing constant [" + result[ 1 ] + "] used in template [" + current.path + "] ...", this );
							}
						}
					}


					// locale?
					if ( this.__lang ){
						var x = this.__lang.languages.length, currentLang;
						current.templates = {};
						if ( !current.rawTemplates ) current.rawTemplates = {};
						current.stemplates = {};
						current.isLocalized = true;


						while( x-- ){
							version = current.file;
							currentLang = this.__lang.languages[ x ];
							reg = /@locale\s*\(\s*([^\)]+)\s*\)\s*;/gi;

							while ( result = reg.exec( version ) ){
								// index must be reset because there occurs a replacement later on which may be shorter that this match
								reg.lastIndex = result.index;


								var   escape 		= result && result[ 1 ] && result[ 1 ].indexOf( "escape" ) >= 0
									, key 			= ( result && result[ 1 ] ? result[ 1 ].replace( /\s*,\s*escape\s*/gi, "" ) : result[ 1 ] ).trim()
									, localeString 	= this.__lang.locale[ currentLang ][ key ];
									

								if ( localeString !== undefined ){
									version = version.replace( new RegExp( "@locale\\s*\\(\\s*" + result[ 1 ] + "\\s*\\)\\s*;", "gi" ), escape ? localeString.replace( /([“”"'’])/g, "\\$1" ) : localeString );
								}
								else {
									version = version.replace( new RegExp( "@locale\\s*\\(\\s*" + result[ 1 ] + "\\s*\\)\\s*;", "gi" ), "locale:" + key );
									log.warn( "missing locale [" + key + "] used in template [" + current.path + "] for language [" + currentLang + "] ...", this );
								}							
							}

							if ( this.__navigation ){
								navreg = /@navigation\s*\(\s*([^\)]+)\s*\)\s*;/gi;
		
								while ( result = navreg.exec( version ) ){

										// index must be reset because there occurs a replacement lateron which may be shorter that this match
									navreg.lastIndex = result.index;

									if ( this.__navigation[ currentLang ][ result[ 1 ] ] !== undefined ){
										version = version.replace( new RegExp( "@navigation\\s*\\(\\s*" + result[ 1 ] + "\\s*\\)\\s*;", "gi" ), "/" + currentLang  + this.__navigation[ currentLang ][ result[ 1 ] ] );
									}
									else{
										version = version.replace( new RegExp( "@navigation\\s*\\(\\s*" + result[ 1 ] + "\\s*\\)\\s*;", "gi" ), "navigation:" + result[ 1 ] );
										log.warn( "missing navigation locale [" + result[ 1 ] + "] used in template [" + current.path + "] for language [" + currentLang + "] ...", this );
									}
								}
							}							

							// compile the template
							current.templates[ currentLang ] = hogan.compile( version );
							current.rawTemplates[ currentLang ] = version;
							current.stemplates[ currentLang ] = "(function(w){if(!w.$it)w.$it={};w.$it['" + webPath + "']=" + hogan.compile( version, { asString: true } ) + "})(window);";
						}
					}
				}
			}
		}




		, __compileTemplates: function(){
			var keys = Object.keys( this.__files ), i = keys.length, current, version, reg, result, navreg;
			
			while( i-- ){
				current = this.__files[ keys[ i ] ];

				if ( current.extension === "tpl" || current.extension === "mustache" ){
					var webPath = current.path.substr( iridium.app.root.length + 3 );
					
					// locale?
					if ( this.__lang ){
						var x = this.__lang.languages.length, currentLang;


						while( x-- ){
							currentLang = this.__lang.languages[ x ];
							
							// compile the template
							current.templates[ currentLang ] = hogan.compile( current.rawTemplates[ currentLang ] );
							//current.stemplates[ currentLang ] = "(function(w){if(!w.$it)w.$it={};w.$it['" + webPath + "']=" + hogan.compile( current.rawTemplates[ currentLang ], { asString: true } ) + "})(window);";
						}
					}

					try {
						current.template  = hogan.compile( current.file );
						//current.stemplate = "(function(w){if(!w.$it)w.$it={};w.$it['" + webPath + "']=" + hogan.compile( current.file, { asString: true } ) + "})(window);";
					} catch ( e ){
						log.dir( current );
					}
				}
			}
		}





		, __compileMJS: function(){
			var graph = this.__graph
				, keys = Object.keys( graph )
				, i = keys.length;

			while( i-- ){
				if ( graph[ keys[ i ] ].entrypoint === true ){
					this.__mergeTree( keys[ i ], [] );
				}
			}

			// log.info( "mjs compiler finished ...", this );
		}






		, __mergeTree: function( fileKey, loadedModules ){
			var tree = this.__collectTree( fileKey )
				, i = tree.length
				, file = ""
				, packedFiles = []
				, deferred = []
				, deferredKeys
				, loadedModulesCopy = []
				, d, k;

			if ( debug ) log.info( "compiling " + ( loadedModules ? "entrypoint ": "" ) + "module [" + fileKey + "] ...", this );

			while( i-- ){
				if ( packedFiles.indexOf( tree[ i ] ) === -1 && loadedModules.indexOf( tree[ i ] ) === -1){
					packedFiles.push( tree[ i ] );
					loadedModules.push( tree[ i ] );
					if ( debug ) log.debug( "adding module [" + tree[ i ] + "] ....", this );

					// concat file
					file += "\n// start module " + tree[ i ] + "\n\n" + this.__graph[ tree[ i ] ].file;

					// colelct deferring modules
					deferredKeys = Object.keys( this.__graph[ tree[ i ] ].deferred ), d = deferredKeys.length;
					while( d-- ){
						if ( deferred.indexOf( deferredKeys[ d ] ) === -1 ) deferred.push( deferredKeys[ d ] );
					}
				}
			}

			// add actual file
			if ( this.__graph[ fileKey ].entrypoint ){
				file += "\n// module code\n\n" + this.__graph[ fileKey ].file;
			}


			// compile deferring modules
			k = deferred.length;
			while( k-- ){
				this.__mergeTree( deferred[ i ], [].concat( loadedModules ) );
			}
			
			// store
			//this.__graph[ fileKey ].file = file;
			this.__graph[ fileKey ].deferringModules = deferred;
			this.__graph[ fileKey ].includedModules = packedFiles;
			
			this.__files[ fileKey ].file = file;
			this.__files[ fileKey ].etag = crypto.createHash( "sha1" ).update( this.__files[ fileKey ].file ).digest( "hex" );
			this.__files[ fileKey ].time = Date.now();
			this.__files[ fileKey ].length = Buffer.byteLength( this.__files[ fileKey ].file );

			this.emit( "change", {
				path: fileKey
				, action: "set"
				, file: this.__files[ fileKey ]
			} );
		}






		, __collectTree: function( file ){
			var graph = this.__graph
				, keys = Object.keys( graph[ file ].dependsOn ), i = keys.length
				, current, currentResult
				, tree = [];

			while( i-- ){
				current = graph[ keys[ i ] ];
				tree.push( keys[ i ] );

				if ( Object.keys( current.dependsOn ).length > 0 ){
					tree = tree.concat( this.__collectTree( keys[ i ] ) );
				}
			}
 
			return tree;
		}





		, __updateDepencyGraph: function( files ){

			// add to depencygraph
			var keys = Object.keys( files ), i = keys.length, current;
			while( i-- ){
				current = files[ keys[ i ] ];

				if ( ! this.__graph[ keys[ i ] ] ) {
					this.__graph[ keys[ i ] ]  = { 
						  dependsOn: {}
						, deferred: {}
						, depencyOf: {}
						, deferredDepencyOf: {}
						, entrypoint: false 
					};	
				}

				this.__graph[ keys[ i ] ].file = current.file;
				this.__graph[ keys[ i ] ].entrypoint = current.entrypoint;
				this.__graph[ keys[ i ] ].updated = true;


				var depencies = files[ keys[ i ] ].depencies, d = depencies.length;

				while( d-- ){
					var currentDepency = depencies[ d ];

					if ( ! this.__graph[ currentDepency.module ] ) {
						this.__graph[ currentDepency.module ]  = { 
							  dependsOn: {}
							, deferred: {}
							, depencyOf: {}
							, deferredDepencyOf: {}
							, entrypoint: false 
						};	
					}

					this.__graph[ currentDepency.module ].updated = true;
					//if ( currentDepency.type === "normal" ) this.__graph[ depencies[ d ] ].depencyOf[ keys[ i ] ] = {};
					//if ( currentDepency.type === "deferred" ) this.__graph[ depencies[ d ] ].deferredDepencyOf[ keys[ i ] ] = {};
					if ( currentDepency.type === "normal" ) this.__graph[ keys[ i ] ].dependsOn[ currentDepency.module ] = {};
					if ( currentDepency.type === "deferred" ) this.__graph[ keys[ i ] ].deferred[ currentDepency.module ] = {};
				}
			}
		}







		// make all paths absolute, convert iridium calls to require calls, collect all paths, return file && modules
		, __flattenMJsFile: function( filePath_, file ){

			file = file.toString();

			// check if the module is an root entrypoint
			var isEntrypoint = /\/\/\s*iridium-entrypoint\s*=\s*true/gi.test( file );

			// remove comments
			file = file.replace( /\/\*[\s\S]*?\*\//gi, "" ).replace( / \/\/.*$/gim, "" );

			var   modulesReg = /require\s*\(\s*"(.+)"\s*\)/gi
				, defferedModuleReg = /require\s*\(\s*"(.+)"\s*[^\)\s]+/gi
				, iridiumModulesReg = /iridium\s*\(\s*"(.+)"\s*\)/gi
				, iridiumCoreReg = /iridium\s*\(\s*"(class|events|domready)"\s*\)/gi
				, regResult
				, replacements = {}
				, modules = []
				, current = ""
				, keys, i;

			filePath_ = filePath_.substr( 0, filePath_.length - 4 );


			// extract paths for deffered modules, they will be made absolute to the webroot
			while( regResult = defferedModuleReg.exec( file ) ){
				replacements[ regResult[ 1 ] ] = path.join( filePath_, regResult[ 1 ] );
				module.push( { type: "deffered", module: replacements[ regResult[ 1 ] ] } );
			}

			// extract the regular modules
			while( regResult = modulesReg.exec( file ) ){
				replacements[ regResult[ 1 ] ] = path.join( filePath_, "../", regResult[ 1 ] + ".mjs" ); 				
				modules.push( { type: "normal", module: replacements[ regResult[ 1 ] ] } );
			}


			// replace relative paths with absolute paths
			keys = Object.keys( replacements );
			i = keys.length;

			while( i-- ){
				file = file.replace( new RegExp( "require\\s*\\(\\s*\"" + keys[ i ] + "\"\\s*\\)", "gi" ), "require( \"" + replacements[ keys[ i ] ] + "\" )" );
			}

			// extract iridium core modules
			while( regResult = iridiumCoreReg.exec( file ) ){
				current = path.join( this.__iridiumPath, "core", regResult[ 1 ] + ".mjs" );
				modules.push( { type: "normal", module: current } );
				file = file.replace( new RegExp( "iridium\\s*\\(\\s*\"" + regResult[ 1 ] + "\"\\s*\\)", "gi" ), "require( \"" + current + "\" )" );
			}

			// extract iridium modules
			while( regResult = iridiumModulesReg.exec( file ) ) {
				current = path.join( this.__iridiumPath, "modules", regResult[ 1 ], "index.mjs" );
				modules.push( { type: "normal", module: current } );
				file = file.replace( new RegExp( "iridium\\s*\\(\\s*\"" + regResult[ 1 ] + "\"\\s*\\)", "gi" ), "require( \"" + current + "\" )" );
			}

			file = "( function(){ module = { exports: {} };\n" + file;
			file += "\nwindow.__modules[ \"" + filePath_ + ".mjs\" ] = { module: module.exports, status: \"loaded\" }; } )();";

			return { depencies: modules, file: file, entrypoint: isEntrypoint };
		}






		// make paths absolute, add prefixes for iridium modules, add pre & suffix for clientside depency loading
		, __prepareMJsFile: function( filePath_, file ){

			file = file.toString();

			if ( debug ) log.debug( "preparing mjs module [" + filePath_ + "]...", this );

			var iridium_prefix = '"use strict"; __require( "@moduleName", @depencies, function(){ var module = { exports: {} };\n';
			var iridium_suffix = '\nwindow.__iridiumLoader.moduleLoaded( "@moduleName", "@moduleAlias" ); return module; } );'

			var   aliasReg = /iridium-alias=(\S+)/gi.exec( file )
				, modulesReg = /require\s*\(\s*"(.+)"\s*\)/gi
				, defferedModuleReg = /require\s*\(\s*"(.+)"\s*[^\)\s]+/gi
				, iridiumModulesReg = /iridium\.module\s*\(\s*"(.+)"\s*\)/gi
				, iridiumCoreReg = /iridium\s*\(\s*"(.+)"\s*\)/gi
				, regResult
				, replacements = {}
				, modules = [] 
				, keys, i;

			filePath_ = filePath_.substr( 0, filePath_.length - 4 );

			while( regResult = defferedModuleReg.exec( file ) ){
				replacements[ regResult[ 1 ] ] = path.join( filePath_, regResult[ 1 ] );
			}

			while( regResult = modulesReg.exec( file ) ){
				replacements[ regResult[ 1 ] ] = path.join( filePath_, regResult[ 1 ] ); 				
				modules.push( replacements[ regResult[ 1 ] ] );
			}

			keys = Object.keys( replacements );
			i = keys.length;

			while( i-- ){
				file = file.replace( new RegExp( "require\\s*\\(\\s*\"" + keys[ i ] + "\"\\s*\\)", "gi" ), "require( \"" + replacements[ keys[ i ] ] + "\" )" );
			}


			while( regResult = iridiumModulesReg.exec( file ) ) {
				modules.push( "iridium-module://" + regResult[ 1 ] );
			}

			while( regResult = iridiumCoreReg.exec( file ) ){
				modules.push( "iridium://" + regResult[ 1 ] );
			}

			return iridium_prefix.replace( /@moduleName/gi, filePath_ ).replace( /@depencies/gi, JSON.stringify( modules ) ) + file + iridium_suffix.replace( /@moduleName/gi, "/" + path ).replace( /@moduleAlias/gi, aliasReg ? aliasReg[ 1 ] : "" );
		}






		// load files recursively
		, __load: function( path, loadedFiles, callback ){
			var loadedFiles = loadedFiles || []; // the files which were loaded ( and changed -> may require recompile )
			var loading = 1;

			callback = callback || function(){
				this.__compile( loadedFiles );
			}.bind( this ); 			

			loading++;
			fs.stat( path, function( err, stats ){
				if ( stats.isDirectory() ){
					loading++;
					fs.readdir( path, function( err, files ){
						if ( err ) throw err;
						var i = files.length;
						while( i-- ){
							loading++;
							this.__load( path + "/" + files[ i ], loadedFiles, function(){ 
								loading--; 
								if ( loading === 0 ) callback();
							} ); 
						}
						loading--;						
						if ( loading === 0 ) callback();
					}.bind( this ) );
				}
				else if ( stats.isFile() ){
					loading++;

					this.__loadFile( path, function(){
						loadedFiles.push( path.substr( this.__path.length ) );

						loading--; 
						if ( loading === 0 ) callback();
					}.bind( this ) );
				}
				loading--;
				if ( loading === 0 ) callback();
			}.bind( this ) );

			loading--; 
			if ( loading === 0 ) callback();
		}
	} );