


	var Class 			= iridium( "class" )
		, log 			= iridium( "log" )
		, Model 		= iridium( "db" ).Model; 


	module.exports = new Class( {
		inherits: Model

		, __properties: {
			  id: 				Model.PRIMARY
			, sessionId: 		null
			, created: 			null
			, modified: 		null
		}



		, save: function( callback ){
			this.modified = new Date();
			this.parent.save.call( this, callback );
		}
	} );