	"use strict";

	require( "http" ).globalAgent.maxSockets = 1024;


	// this is the mainfile required for operating using the iridium framework
	// import this as fake sub repository into your project

	var prorotype 	= require( "./core/prototype" )
		, path 		= module.filename.substr( 0, module.filename.lastIndexOf( "/" ) + 1 )
		, mpath 	= path + "modules/"
		, cpath 	= path + "core/"
		, log 		= require( "./core/log" )
		, fs 		= require( "fs" )
		, cluster 	= require( "cluster" );




	// the iridium module loader
	global.iridium = function( coreModule ){
		if ( fs.existsSync( cpath + coreModule + ".js" ) ){
			return require( cpath + coreModule );
		}
		else {
			return require( mpath + coreModule );
		}
	}



	global.iridium.report = function( status, collection, err ){
		var source = new Error().stack.split( "\n" ).map( function( line ){
			var reg = /\(([^\)]+\/[^\)]+)\)/ig.exec( line );
			return reg && reg[ 1 ] ? reg[ 1 ] : null ;
		} ).filter( function( line ){
			return !!line;
		} );

		var item = {
			collection: collection
			, status: status
			, stacktrace: source.length > 0 ? source.slice( 1 ) : [] 
			, err: err
			, date: new Date().toUTCString()
		};

		log.error( "reporting error: " );
		log.dir( item );
	}


	// storage for som eglobal iridium objects
	global.iridium.__ = {};


	// path
	iridium.path = path;
	iridium.root = path.substr( 0, path.substr( 0, path.length - 1 ).lastIndexOf( "/" ) + 1 );
	iridium.app = {
		root: iridium( "util" ).argv.getCallingPath()
	};
	iridium.app.user = iridium.app.root + "user/";


	if ( fs.existsSync( iridium.app.root + "config.js" ) ){
		iridium.app.config = require( iridium.app.root + "config.js" );
	}


	// print iridium intro
	module.exports = function( productName, version, dontPrint ){
		var options 	= typeof productName === "object" ? productName : {}
			, airbrake 	= options.airbrake ? iridium( "util" ).airbrake.createClient( options.airbrake ) : null;


		if ( typeof productName === "string" ){
			options = {
				name: 			productName
				, version:		version
				, dontPrint: 	dontPrint
			}
		}
		else {
			options = productName;
		}

/*

		// intercept traces
		if ( airbrake ){
			var trace = log.trace;

			log.trace = function( err, source ){
				if ( err ){
					try {
						airbrake.notify( err, function( airbrakeErr, url ){
							if ( airbrakeErr ){
								//log.error( "error while reporting error to airbrake!", { $id: "iridium" } );
								//trace.call( log, airbrakeErr );
							}
							else {
								log.info( "error was delivered to airbrake ...", { $id: "iridium" } );
							}
						} ); 
					} catch ( e ){
						// i have seen more stable software... dont let it brake ours..
						//log.error( "error while reporting error to airbrake!", { $id: "iridium" } );
						//trace.call( log, e );
					}
				}

				// call the trace function
				trace.call( log, err, source );
			}
		}

		// handle uncatched
		process.on( "uncaughtException", function( err ){
			
			// send errors to airbrake?
			if ( airbrake ){
				airbrake.notify( err, function( airbrakeErr, url ){
					if ( airbrakeErr ){
						log.error( "error while reporting error to airbrake!", { $id: "iridium" } );
						log.trace( airbrakeErr );
					}
					else {
						log.info( "error was delivered to airbrake ...", { $id: "iridium" } );
					}

					log.error( "Uncaught Exception:", { $id: "main.js:main" } );
					log.trace( err );
					process.exit();
				} ); 
			}
			else {
				log.error( "Uncaught Exception:", { $id: "main.js:main" } );
				log.trace( err );
				process.exit();
			}			
		} );*/

		if ( cluster.isMaster && !options.dontPrint ) printLogo( options.name, options.version );
	};


	/*process.on( "uncaughtException", function( err ){			
		log.error( "Uncaught Exception:", { $id: "iridium.index" } );
		log.trace( err );
		process.exit();
	} );*/



	var printLogo = function( productName, version ){
		var productString = ( ( productName || "noname" ) + "/" + ( version.toString().indexOf( "." ) === -1 ? ( version.toString() + ".0" ) : version.toString() || "1.0" ) ).white.bold;
			
		var logo = [
			  "\n"
			, "                              . .  ,  , ".yellow.bold
			, "                              |` \\/ \\/ \\,', ".yellow.bold
			, "                              ;          ` \\/\,. ".yellow.bold
			, "                             :               ` \\,/ ".yellow.bold
			, "                             |                  / ".yellow.bold
			, "                             ;                 : ".yellow.bold
			, "                            :                  ; ".yellow.bold
			, "                            |      ,---.      / ".yellow.bold
			, "                           :     ,'     `,-._ \\ ".yellow.bold
			, "                           ;    (   ".yellow.bold + "o".white + "    \\   `' ".yellow.bold
			, "                         _:      .      ,'  ".yellow.bold + "o".white + " ; ".yellow.bold
			, "                        /,.`      `.__,'`-.__, ".yellow.bold
			, "                        \\_  _               \\ ".yellow.bold
			, "                       ,'  / `,          `.,' ".yellow.bold
			, "                 ___,'`-.".yellow + "_ \\_".yellow.bold + "/".white + " `,._        ; ".yellow.bold
			, "             __;_,'      `-.".yellow + "`-'.".yellow.bold + "/".white + " `--.____) ".yellow.bold
			, "          ,-'           _,--\\".yellow + "^-' ".yellow.bold
			, "         ,:_____      ,-'     \\ ".yellow
			, "        :    Y".yellow.bold + "      `-".yellow + "/".yellow.bold + "    `,  : ".yellow
			, "        :    :       :     /".yellow.bold + "_;' ".yellow + "       ___   ________     ___   _______     ___   ___   ___   ___    ___".white
			, "        :    :       |    : ".yellow.bold + "          |   | |        `.  |   | |       `.  |   | |   | |   | |   \\  /   |".white
			, "         \\    \\      :    : ".yellow.bold + "          |   | |   .-.   |  |   | |   ...   | |   | |   | |   | |    \\/    |".white
			, "          `-._ `-.__, \\    `. ".yellow.bold + "        |   | |   |_;   |  |   | |   | |   | |   | |   | |   | |          |".white
			, "             \\   \\  `. \\     `. ".yellow.bold + "      |   | |       |´   |   | |   | |   | |   | |   | |   | |   |\\/|   |".white
			, "           ,-".blue.bold + ";".yellow.bold + "    ".blue.bold + "\\".yellow.bold + "---".blue.bold + ")".yellow.bold + "_".blue.bold + "\\ ,','/ ".yellow.bold + "      |   | |   |\\   \\   |   | |   | |   | |   | |   | |   | |   |  |   |".white
			, "           \\_ `---".blue.bold + "'".yellow.bold + "--'\" ,".blue.bold + "'^".yellow.bold + "-;".yellow.bold + "'".yellow.bold + "        |   | |   | \\   \\  |   | |    \"    | |   | |    \"    | |   |  |   |".white
			, "           (_`     ---'\" ,-') ".blue.bold + "        |___| |___|  \\___\\ |___| |________.' |___|  \\________| |___|  |___|".white
			, "           / `--.__,. ,-'    \\ ".blue.bold + "        ___                ___               ___".white
			, "           )-.__,-- ||___,--' `-. ".blue.bold + "    |___|              |___|             |___|".white + new Array( ( productString.length < 45 ? 45 - productString.length : 2) ).join( " " ) + productString 
			, "          /".white + "._______,|__________,'".blue.bold+"\\ ".white
			, "         `--.____,'|_________,-'´".white
			, "\n\n"
		];

		logo.forEach( function( item ){
			console.log( item.green );
		}.bind( this ) );
	}