# Using Groups

**Audience:** game masters building moving scenery, carts, ships and stages.

A group is a pin on the map plus the tiles, drawings, lights, sounds, walls, notes and regions that travel with it. Drag the pin and everything moves. Turn the pin and everything turns about it.

## Make a group

1. Open the Puppeteer Groups tool (toolbar) to get the Group Editor.
2. Choose New Group. A pin appears at the centre of your view.
3. Select the objects that belong to it and choose Add Selected, or choose Capture Area and drag a box around them. Regions are added with Add Selected.

Right-click the pin for the same actions, or double-click it to open the Group Editor on that group.

## Move and turn it

- **Move:** drag the pin. Players see the group glide.
- **Turn:** select the pin and hold Shift while scrolling the mouse wheel over the board. Each notch is 5 degrees. The Group Editor's heading field and rotate buttons do the same thing.
- **Centre Pivot** moves the pin to the middle of the group without moving anything, so it turns about its own centre.
- **Move Pivot** puts the pin anywhere: the prow of a ship, a wagon's hitch, a door's hinge. Choose Move Pivot on the group (it turns blue and a notice shows) and drag the pin to where the grip should be. The pin moves, nothing else does, and Move Pivot switches itself off when you drop the pin. After that, the group moves and turns about the new spot.

The pin is the only handle. You can hide it, change its look, or choose who may move it, and the group is unaffected.

## Edit by hand

Move, turn or resize any part directly and the group remembers the new position. Nothing snaps back on the next move.

## See what is in a group

Show group bounds (title-bar icon) draws the box around each group, its pivot and the way it faces. Click the icon beside a member in the Group Editor to select it on the map. Click a member's id to copy its UUID. Members can be given names.

## Save and reuse

Save to Library stores a group so you can stamp it onto any scene, as many times as you like. Each stamp is an independent copy with its own pin. If the group is a target, every stamp is too: it comes with its own body for the same actor, with its own hit points. The Library shows which actor an entry represents. A stamp in a world that does not have that actor has no body, and you are told. Libraries can be exported to and imported from JSON files.

## Delete

Deleting a group asks whether to remove its parts from the map too. Choose Delete group only to keep them.

## Make a group a target

Most groups do not need this. A group is a pin and its parts, and it moves and turns without any actor. Add a body only when the group itself should be something players can attack, such as a siege engine, a wagon or a monster that is built from scenery. Give it a body and the whole group becomes one target.

1. In the Group Editor, drag an actor from the Actors sidebar onto the group's body row. (Or select a token already on the map and choose Use Selected Token.)
2. Puppeteer adds an invisible token for that actor, as big as the group. Click anywhere over the group to select or target it; attacks, damage and the sheet work as for any monster.
3. The actor's picture is never shown on the map, and you never place, size or move the token. It follows the group and changes size as you add or remove parts or turn the group.

Notes:
- The token is **unlinked** by default, so two copies of a group have separate hit points. Tick Linked to share one set.
- You cannot drag the token. Move the group by its pin.
- At a diagonal heading the token is a little larger than the group, because a token's footprint does not turn.
- Lights and sounds do not count towards the size.
- Remove the body with the cross on its row. Deleting the group deletes its body.
- Actors in a compendium must be imported into the world first.

## Carry tokens as riders

A group can carry tokens, such as the crew of a ship or passengers on a wagon.

1. Tick Tokens board when they move onto it on the group's Riders row. From then on, any token that moves onto the group boards it, and so does a token created there by dragging an actor from the sidebar onto the group. Or leave it off and select tokens that are on the group and choose Board Selected.
2. When the group moves or turns, its riders go with it, including a quarter turn that swings them round the pin.
3. A rider can walk about the group freely. Wherever you put it is where it rides from then on.
4. Move a rider off the group and it dismounts where it stands, and you are told. Dismount on its row lets it go on purpose, and it will not board again until it has left the group and come back. Deleting the group lets every rider go where it is.

Riders jump to their new place when the group moves, as lights and walls do. A player choosing to board from a distance and chat announcements are not there yet. Note that with the option on, every token that moves onto the group boards, enemies included.

## Behaviour

Each group has a Behaviour section in the Group Editor.

- **Moves by Gliding or Jumping, over a number of milliseconds.** Gliding eases the group, and any riders, to its new place when its pin moves or turns, and follows the pointer while you drag. Jumping shows no movement between the two places. Lights, walls, sounds and regions always jump, because they cannot be drawn in between.
- **Turns when its pin turns.** Switch it off for a group that should slide about without ever turning, such as a platform on rails. The group keeps the way it faces now, the heading field is disabled, and the pin can be turned freely.
- **Riders can move about.** Switch it off and a rider moved by hand is put straight back where it rides.
- **Announce boarding in chat.** Posts a card and plays a soft sound for everyone when a token boards or leaves.

The menubar has a button that shows or hides the group bounds (it lights up while they are shown) and one that opens the Group Editor. Puppeteer's messages come on their own notification channel, so you can switch them off in Blacksmith's settings.

## Coming next

Nothing is planned yet beyond what you ask for.
