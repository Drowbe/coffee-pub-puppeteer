# Using Groups

**Audience:** game masters building moving scenery, carts, ships and stages.

A group is a pin on the map plus the tiles, drawings, lights, sounds, walls, notes and regions that travel with it. Drag the pin and everything moves. Turn the pin and everything turns about it.

## Make a group

1. Open the Puppeteer Groups tool (toolbar) to get the Group Editor.
2. Choose New Group. A pin appears at the centre of your view.
3. Select the objects that belong to it and choose Add Selected, or choose Capture Area and drag a box around them. Regions are added with Add Selected.

Right-click the pin for the same actions.

## Move and turn it

- **Move:** drag the pin. Players see the group glide.
- **Turn:** select the pin and hold Shift while scrolling the mouse wheel over the board. Each notch is 5 degrees. The Group Editor's heading field and rotate buttons do the same thing.
- **Centre Pivot** moves the pin to the middle of the group without moving anything, so it turns about its own centre.

The pin is the only handle. You can hide it, change its look, or choose who may move it, and the group is unaffected.

## Edit by hand

Move, turn or resize any part directly and the group remembers the new position. Nothing snaps back on the next move.

## See what is in a group

Show group bounds (title-bar icon) draws the box around each group, its pivot and the way it faces. Click the icon beside a member in the Group Editor to select it on the map. Click a member's id to copy its UUID. Members can be given names.

## Save and reuse

Save to Library stores a group so you can stamp it onto any scene, as many times as you like. Each stamp is an independent copy with its own pin. Libraries can be exported to and imported from JSON files.

## Delete

Deleting a group asks whether to remove its parts from the map too. Choose Delete group only to keep them.

## Make a group a target

By default nothing on a group can be attacked. Give it a body and the whole group becomes one target.

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

## Coming next

Naming an actor in a library entry, so every stamp comes with its body, and carrying other tokens as riders.
