/**
 * Engine/MapEngine/Entity.js
 *
 * Manage Entity based on received packets from server 
 *
 * This file is part of ROBrowser, Ragnarok Online in the Web Browser (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

define(function( require )
{
	"use strict";


	/**
	 * Load dependencies
	 */
	var DB            = require('DB/DBManager');
	var Network       = require('Network/NetworkManager');
	var PACKET        = require('Network/PacketStructure');
	var Renderer      = require('Renderer/Renderer');
	var EntityManager = require('Renderer/EntityManager');
	var Entity        = require('Renderer/Entity/Entity');
	var Altitude      = require('Renderer/Map/Altitude');
	var ChatBox       = require('UI/Components/ChatBox/ChatBox');
	var Damage        = require('Renderer/Effects/Damage');


	/**
	 * @var {Entity} Main Player
	 */
	var MainPlayer;


	/**
	 * Spam an entity on the map
	 * Generic packet handler
	 */
	function Create( pkt )
	{
		var entity = new Entity();
		entity.set(pkt);
		EntityManager.add(entity);
	}


	/**
	 * Remove an entity from the map
	 *
	 * @param {object} pkt - PACKET.ZC.NOTIFY_VANISH
	 */
	function Remove( pkt )
	{
		var entity = EntityManager.get(pkt.GID);
		if( entity ) {
			entity.remove( pkt.type );
		}
	}


	/**
	 * An entity start walking
	 *
	 * @param {object} pkt - PACKET.ZC.NOTIFY_MOVE
	 */
	function Walk( pkt )
	{
		var entity = EntityManager.get(pkt.GID);
		if( entity ) {
			//entity.position[0] = pkt.MoveData[0];
			//entity.position[1] = pkt.MoveData[1];
			//entity.position[2] = Altitude.getCellHeight(  pkt.MoveData[0],  pkt.MoveData[1] );
			entity.walkTo( pkt.MoveData[0], pkt.MoveData[1], pkt.MoveData[2], pkt.MoveData[3] );
		}
	}


	/**
	 * Entity stop walking
	 *
	 * @param {object} pkt - PACKET.ZC.STOPMOVE
	 */
	function Stop( pkt )
	{
		var entity = EntityManager.get(pkt.GID);
		if( entity ) {

			if( Math.abs(entity.position[0] - pkt.xPos) > 1.0 || Math.abs(entity.position[1] - pkt.yPos) > 1.0 ) {
				entity.position[0] = pkt.xPos;
				entity.position[1] = pkt.yPos;
				entity.position[2] = Altitude.getCellHeight( pkt.xPos,  pkt.yPos );
			}

			entity.setAction({
				action: entity.ACTION.IDLE,
				frame:  0,
				repeat: true,
				play:   true
			});
		}
	}


	/**
	 * Perform Entity Action
	 *
	 * @param {object} pkt - PACKET.ZC.NOTIFY_ACT
	 */
	function Action( pkt )
	{
		var srcEntity = EntityManager.get(pkt.GID);
		var dstEntity = EntityManager.get(pkt.targetGID);

		// Entity out of the screen ?
		if( !srcEntity ) {
			return;
		}

		switch( pkt.action ) {

			// Damage
			case 0:
				if ( dstEntity ) {
					if ( pkt.damage ) {
						dstEntity.setAction({
							delay:  Renderer.tick + pkt.attackMT,
							action: dstEntity.ACTION.HURT,
							frame:  0,
							repeat: false,
							play:   true,
							next: {
								delay:  Renderer.tick + pkt.attackMT * 2,
								action: dstEntity.ACTION.READYFIGHT,
								frame:  0,
								repeat: true,
								play:   true,
								next:   false
							}
						});
					}

					// Display damage
					Damage.add( pkt.damage, pkt.damage ? dstEntity : srcEntity, Renderer.tick + pkt.attackMT );

					// Update entity position
					srcEntity.lookTo( dstEntity.position[0], dstEntity.position[1] );
				}

				pkt.attackMT = Math.min( 450, pkt.attackMT); // FIXME: cap value ?
				pkt.attackMT = Math.max(   1, pkt.attackMT);
				srcEntity.attack_speed = pkt.attackMT;
				srcEntity.setAction({
					action: srcEntity.ACTION.ATTACK,
					frame:  0,
					repeat: false,
					play:   true,
					next: {
						delay:  Renderer.tick + pkt.attackMT * 2,
						action: srcEntity.ACTION.READYFIGHT,
						frame:  0,
						repeat: true,
						play:   true,
						next:  false
					}
				});
				break;

			// Pickup item
			case 1:
				srcEntity.setAction({
					action: srcEntity.ACTION.PICKUP,
					frame:  0,
					repeat: false,
					play:   true,
					next:{
						action: srcEntity.ACTION.IDLE,
						frame:  0,
						repeat: true,
						play:   true,
						next:   false
					}
				});
				break;

			// Sit Down
			case 2:
				srcEntity.setAction({
					action: srcEntity.ACTION.SIT,
					frame:  0,
					repeat: true,
					play:   true
				});
				break;

			// Stand up
			case 3:
				srcEntity.setAction({
					action: srcEntity.ACTION.IDLE,
					frame:  0,
					repeat: true,
					play:   true
				});
				break;

			/* TODO:
			 * type=04 reflected/absorbed damage?
			 * type=08 double attack
			 * type=09 don't display flinch animation (endure)
			 * type=0a critical hit
			 * type=0b lucky dodge
			 */
		}
	}


	/**
	 * Entity say something
	 *
	 * @param {object} pkt - PACKET.ZC.NOTIFY_CHAT
	 */
	function Talk( pkt )
	{
		// Remove "pseudo : |00Dialogue
		pkt.msg = pkt.msg.replace(/\: \|\d{2}/, ': ');

		var entity = EntityManager.get(pkt.GID);
		if( entity ) {
			entity.dialog.set( pkt.msg );
		}

		var type = ChatBox.TYPE.PUBLIC;

		// Should not happened
		if( entity === MainPlayer ) {
			type |= ChatBox.TYPE.SELF;
		}

		ChatBox.addText( pkt.msg, type );
	}


	/**
	 * Display entity's name
	 *
	 * @param {object} pkt - PACKET.ZC.ACK_REQNAME
	 */
	function DisplayName( pkt )
	{
		var entity = EntityManager.get(pkt.AID);
		if( entity ) {
			entity.display.name = pkt.CName;

			if( pkt.PName ) {
				entity.display.party_name = pkt.PName;
				entity.display.guild_name = pkt.GName;
				entity.display.guild_rank = pkt.RName;
			}

			entity.display.load = entity.display.TYPE.COMPLETE;
			entity.display.update(
				entity.objecttype === Entity.TYPE_MOB ? "#ffc6c6" :
				entity.objecttype === Entity.TYPE_NPC ? "#94bdf7" :
				'white'
			);

			if( EntityManager.getOverEntity() === entity ) {
				entity.display.add();
			}
		}
	}


	/**
	 * Updating entity direction
	 *
	 * @param {object} pkt - PACKET.ZC.CHANGE_DIRECTION
	 */
	function UpdateDirection( pkt )
	{
		var entity = EntityManager.get(pkt.AID);
		if( entity ) {
			entity.direction = ([ 4, 3, 2, 1, 0, 7, 6, 5 ])[pkt.dir];
			entity.headDir   = pkt.headDir;
		}
	}


	/**
	 * Update Entity's visual look
	 *
	 * @param {object} pkt - PACKET.ZC.SPRITE_CHANGE2
	 */
	function UpdateView( pkt )
	{
		var entity = EntityManager.get(pkt.GID);

		if( !entity ) {
			return;
		}

		switch( pkt.type ) {
			case 0: entity.job         = pkt.value; break;
			case 1: entity.head        = pkt.value; break;
			case 2: entity.weapon      = pkt.value; break;
			case 3: entity.accessory3  = pkt.value; break;
			case 4: entity.accessory   = pkt.value; break;
			case 5: entity.accessory2  = pkt.value; break;
			case 6: entity.headpalette = pkt.value; break;
			case 7: entity.bodypalette = pkt.value; break;
			case 8: entity.shield      = pkt.value; break;
			case 9:  break; // UNKNOWN
			case 10: break; // UNKNOWN²
			case 11: break; // robe, not supported yet
		}
	}


	/**
	 * Entity use skill on another entity (no damage : heal, boost, etc.)
	 *
	 * @param {object} pkt - PACKET.ZC.USE_SKILL
	 */
	function UseSkillNoDamage( pkt )
	{
		var srcEntity = EntityManager.get(pkt.srcAID);
		var dstEntity = EntityManager.get(pkt.targetAID);

		if( !srcEntity ) {
			return;
		}

		srcEntity.setAction({
			action: srcEntity.ACTION.SKILL,
			frame:  0,
			repeat: false,
			play:   true,
			next: {
				action: srcEntity.ACTION.IDLE,
				frame: 0,
				repeat: true,
				play: true,
				next: false
			}
		});

		// Only mob to don't display skill name ?
		if( srcEntity.type !== Entity.TYPE_MOB ) {
			srcEntity.dialog.set(
				( ( DB.skillList[pkt.SKID] && DB.skillList[pkt.SKID].name ) || 'Unknown Skill' ) + ' !!',
				'white'
			);
		}

		if( dstEntity ) {
			srcEntity.lookTo( dstEntity.position[0], dstEntity.position[1] );

			// Don't know why Gravity did this...
			if ( pkt.SKID === DB.skillList.AL_HEAL ) {
				Damage.add( pkt.level, dstEntity, Renderer.tick, Damage.TYPE.HEAL );
			}
			else {
				// skill_lvl = heal.
			}
		}
	}


	/**
	 * Entity use skill on another entity with damage
	 *
	 * @param {object} pkt - PACKET.ZC.NOTIFY_SKILL
	 */
	function UseSkillDamage( pkt )
	{
		var srcEntity = EntityManager.get(pkt.AID);
		var dstEntity = EntityManager.get(pkt.targetID);

		if( srcEntity ) {
			pkt.attackMT = Math.min( 450, pkt.attackMT ); // FIXME: cap value ?
			pkt.attackMT = Math.max(   1, pkt.attackMT );
			srcEntity.attack_speed = pkt.attackMT;

			srcEntity.setAction({
				action: srcEntity.ACTION.SKILL,
				frame:  0,
				repeat: false,
				play:   true,
				next: {
					action: srcEntity.ACTION.READYFIGHT,
					frame:  0,
					repeat: true,
					play:   true,
					next:  false
				}
			});

			if ( srcEntity.objecttype !== Entity.TYPE_MOB ) {
				srcEntity.dialog.set( ( ( DB.skillList[pkt.SKID] && DB.skillList[pkt.SKID].name ) || "Unknown Skill" ) + " !!" );
			}
		}

		if( dstEntity  ) {
			pkt.attackedMT = Math.min( 450, pkt.attackedMT ); // FIXME: cap value ?
			pkt.attackedMT = Math.max(   1, pkt.attackedMT );
			dstEntity.attack_speed = pkt.attackedMT;

			if( pkt.damage ) {
				dstEntity.setAction({
					action: dstEntity.ACTION.HURT,
					frame:  0,
					repeat: false,
					play:   true,
					next: {
						action: dstEntity.ACTION.READYFIGHT,
						frame:  0,
						repeat: true,
						play:   true,
						next:   false
					}
				});

				// Combo
				for ( var i = 0; i<pkt.count; ++i ) {
					Damage.add( Math.round( pkt.damage / pkt.count ), dstEntity, Renderer.tick + srcEntity.attack_speed + ( 200 * i ), Damage.TYPE.COMBO );
					//Damage.add( Math.round( pkt.damage / pkt.count ), dstEntity, Renderer.tick + srcEntity.attack_speed + ( 200 * i ), Damage.TYPE.COMBO_TITLE );
				}
			}
		}
	}


	/**
	 * Cast a skill to someone
	 * @param {object} pkt - pkt PACKET.ZC.USESKILL_ACK
	 */
	function CastSkill( pkt )
	{
		// property:
		//     0 = Yellow cast aura
		//     1 = Water elemental cast aura
		//     2 = Earth elemental cast aura
		//     3 = Fire elemental cast aura
		//     4 = Wind elemental cast aura
		//     5 = Poison elemental cast aura
		//     6 = Holy elemental cast aura
		//     ? = like 0
		// is disposable:
		//     0 = yellow chat text "[src name] will use skill [skill name]."
		//     1 = no text

		var srcEntity = EntityManager.get(pkt.AID);
		var dstEntity = EntityManager.get(pkt.targetID);

		if( !srcEntity ) {
			return;
		}

		srcEntity.cast.set( pkt.delayTime );

		// Only mob to don't display skill name ?
		if( srcEntity.objecttype !== Entity.TYPE_MOB ) {
			srcEntity.dialog.set(
				( ( DB.skillList[pkt.SKID] && DB.skillList[pkt.SKID].name ) || 'Unknown Skill' ) + ' !!',
				'white'
			);
		}

		if ( dstEntity && dstEntity !== srcEntity ) {
			srcEntity.lookTo( dstEntity.position[0], dstEntity.position[1] );
		}
		else if ( pkt.xPos && pkt.yPos ) {
			srcEntity.lookTo( pkt.xPos, pkt.yPos );
		}
	}


	/**
	 * Initialize
	 */
	return function EntityEngine()
	{
		MainPlayer = this.entity;

		Network.hookPacket( PACKET.ZC.NOTIFY_STANDENTRY,     Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_NEWENTRY,       Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_ACTENTRY,       Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_MOVEENTRY,      Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_STANDENTRY_NPC, Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_STANDENTRY2,    Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_NEWENTRY2,      Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_MOVEENTRY2,     Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_STANDENTRY3,    Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_NEWENTRY3,      Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_MOVEENTRY3,     Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_STANDENTRY4,    Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_NEWENTRY4,      Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_MOVEENTRY4,     Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_STANDENTRY5,    Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_NEWENTRY5,      Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_MOVEENTRY5,     Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_STANDENTRY6,    Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_NEWENTRY6,      Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_MOVEENTRY6,     Create );
		Network.hookPacket( PACKET.ZC.NOTIFY_VANISH,         Remove );
		Network.hookPacket( PACKET.ZC.NOTIFY_MOVE,           Walk );
		Network.hookPacket( PACKET.ZC.STOPMOVE,              Stop );
		Network.hookPacket( PACKET.ZC.NOTIFY_ACT,            Action );
		Network.hookPacket( PACKET.ZC.NOTIFY_ACT2,           Action );
		Network.hookPacket( PACKET.ZC.NOTIFY_CHAT,           Talk );
		Network.hookPacket( PACKET.ZC.ACK_REQNAME,           DisplayName );
		Network.hookPacket( PACKET.ZC.ACK_REQNAMEALL,        DisplayName );
		Network.hookPacket( PACKET.ZC.CHANGE_DIRECTION,      UpdateDirection );
		Network.hookPacket( PACKET.ZC.SPRITE_CHANGE,         UpdateView );
		Network.hookPacket( PACKET.ZC.SPRITE_CHANGE2,        UpdateView );
		Network.hookPacket( PACKET.ZC.USE_SKILL,             UseSkillNoDamage );
		Network.hookPacket( PACKET.ZC.NOTIFY_SKILL,          UseSkillDamage );
		Network.hookPacket( PACKET.ZC.NOTIFY_SKILL2,         UseSkillDamage );
		Network.hookPacket( PACKET.ZC.NOTIFY_SKILL_POSITION, UseSkillDamage );
		Network.hookPacket( PACKET.ZC.USESKILL_ACK,          CastSkill );
		Network.hookPacket( PACKET.ZC.USESKILL_ACK2,         CastSkill );
	};
});