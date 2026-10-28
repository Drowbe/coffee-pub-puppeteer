# Building and Moving Groups

**Audience:** game masters building carts, ships, drawbridges and stages.

Everything here is GM only. A group is a pin on the map plus the tiles, drawings, lights, sounds, walls, notes and regions that travel with it.

## Add and remove parts

1. Open the Group Editor with **Puppeteer Groups** in the toolbar. Each group on the **Scene Groups** tab is a card. A closed card is one line: a small picture of the group (drawn from its parts, so groups can be told apart), its name, how many parts it has and which way it faces, with **Go To Pin**, **Hide** and icons beside them to duplicate the group, save it to the Library (the same icon as the Library tab), export it as a file, and delete it. An open card shows Token, Riders, Behaviour, Position, Events and Parts, in that order. Choose the arrow at its left to open it. Open cards stay open until you close them.
2. Select objects on the map and choose **Add Selected**. Foundry shows one layer at a time, so add one layer's objects, then switch layers and add the next. Regions are added this way too.
3. Or choose **Capture Area** and drag a box. Everything inside it, on every layer, joins the group.
4. To take parts out, select them and choose **Remove Selected**, or use the cross beside a part under **Parts**.
5. To reorder the list, drag a part by its grip (the dotted handle on its left) and drop it on the row it should sit before, or on the lower half of a row to put it after. The list is also the order the parts are drawn in, and it always shows it: of the tiles, the one nearest the top is in front, and the same for the drawings, so a change to a tile's sort order or elevation on the canvas shows in the list. Drag a canopy above a horse to put it over the horse. A part at a different elevation from the others is still drawn by its elevation first. The gear button on a row opens that part's own edit window, the same as double-clicking it on the canvas.

Right-clicking the pin gives the same actions, and double-clicking the pin opens the Group Editor on that group. The pin menu also has **Hide or Show Group**, **Duplicate Group** and four submenus for what is done less often: **Modify Group** (capture an area into the group, add the selected items, remove the selected items, select the group's members), **Lights, Sounds and Bounds** (switch the group's lights, switch its sounds, show or hide its bounds), **Pivot and Rotation** (move the pivot to the group's centre, rotate 90 degrees either way) and **Group Layer** (bring the group to the front, send it to the back). The lights and sounds items flip them together: if any is on they all go off, and if none is they all come on; a group that has none says so.

## Name parts and find them again

Under **Parts**, choose the pencil beside a part's name and type a new one, such as "Left lantern". Press Enter or click away to keep it, or Escape to put it back. A group's name is changed the same way, from the pencil in its card. Choose a part's row to select it on the map, which makes a wall or a light easy to pick out, and hold Shift to add to your selection. The map pans to it if it is off screen. Choosing a rider's row under **Riders** selects its token the same way. Choose a part's id to copy its UUID.

**Show group bounds** (an icon in the editor's title bar, a toolbar tool, and **Group Bounds** on the Puppeteer bar) draws the box around each group, its pivot and the way it faces. It is off by default and remembered for you.

## Hide and show a group

Choose **Hide** on a closed or open card to hide the group's tiles, drawings, regions and token, and to turn its lights and sounds off. The button becomes **Show**, and the group's name turns italic. Walls and notes have no hidden state in Foundry, so they stay as they are, and so do any riders, because they are somebody's token. Parts that were already hidden or off when you hid the group stay that way when you show it.

To hide one part, choose the eye beside it under **Parts**. A light or a sound has a power button instead, lit orange while it is on, because turning it off is what Foundry means by hiding it. Hiding the group does not stop it moving: drag the pin and the hidden parts follow.

## Move and turn a group

- **Move:** drag the pin.
- **Turn:** select the pin, hold Shift and scroll the mouse wheel over the board. Each notch is 5 degrees. The **Heading** field and the rotate buttons under **Position** do the same.

## Choose where the group turns about

The **...** menu in the group card's bar has **Bring to Front** and **Send to Back**. Where the group turns about is under **Pin** on an open card.

- **Bring to Front** and **Send to Back** draw the whole group above or below everything else on the scene (its tiles and drawings; the parts keep their order among themselves). If something still covers the group afterwards, it is higher by elevation, and the elevation needs changing instead.
- **Centre Pivot** (under **Pin**) moves the pin to the middle of the group without moving anything, so the group turns about its own centre.
- **Move Pivot** (under **Pin**) puts the pin anywhere, and points it anywhere: the prow of a ship, a wagon's hitch or a door's hinge. Choose it (the button reads **Move Pivot: On** and the card shows a notice), then drag the pin to where you want it and turn it with Shift and the wheel. Only the pin moves or turns; nothing else does, however many times you do it. It stays on until you choose **Move Pivot** again, and then the group moves and turns about the new spot.
- **Front of the group** (under **Pin**) says which end of the group is its front, measured from the pin's arrow: **Down**, **Left**, **Up** or **Right**, or a number of degrees. It is what a group that **Faces its travel** leads with. Turn the pin to point at the front with Move Pivot on and the setting follows the turn, so the front stays the same end of the group.

## Resize a group

Under **Position** on an open card, **Resize** is one line: two opposite buttons, **Smaller** (shrink) and **Bigger** (grow), the step they use (1.25 to begin with, with its × inside the field), the group's **width** in grid squares, and **Reset**. **Bigger** multiplies the group's size by the step and **Smaller** divides by it, so one undoes the other. The group grows or shrinks about its pin: every part sits that many times as far from the pin and is that many times as big, so tiles, drawings, lights, sounds and regions all keep their proportions, and walls and notes move to the new distance. Riders stand that many times as far from the pin but keep their own size, and a group's token is refitted to cover the new size.

**Reset** puts the group back to the size it had before it was resized, however many times it has been. It is greyed out for a group that has not been resized. The width field shows how wide the group is in grid squares, along its own side to side; with **Group Bounds** on, that side is drawn heavier on the map and labelled Width. Type a number to resize the group to exactly that width. Sizes are kept to whole pixels where Foundry needs it, so a long run of resizes can leave a part a pixel out. From a macro: `scale(groupId, factor)` (0.1 to 10), `resetScale(groupId)` and `setWidth(groupId, squares)`.

## Edit parts by hand

Move, turn or resize any part directly on the map. The group remembers the new position and nothing snaps back on the next move.

## Play and pause

A group has a **Pause** button on its card, and **Play or Pause Group** on its pin menu, only when it has an event for it. Add one under **Events** on the card: **Pause is clicked** or **Play is clicked**, then what to do:

- **Start the animations** or **Stop the animations** starts or stops the group's video tiles, on every screen. It uses Foundry's own play and pause for a video tile and sets each tile to start or not start by itself to match, so a group that was stopped is still stopped when the scene is loaded again.
- **Play a sound** plays a sound for everyone. Use it to swap one sound for another, or to hear a click.
- **Run a macro** and **Show a picture on a tile** work as they do for any event.

A group can have as many events on each side as you like. To pause a wagon's animation and quiet it, add **Pause is clicked** with Stop the animations, and **Play is clicked** with Start the animations and a Play a sound. A group starts out playing, so the first press runs the Pause events and the button turns into **Play**. Lights are not touched; Foundry's own lighting animation controls them.

## Duplicate a group

Choose **Duplicate** from the **...** menu in a group's card. A new group appears two squares to the right of the original, named with "copy" after it, with its own parts and its own pin, facing the same way. It keeps the original's behaviour settings and, if the original can be attacked, gets its own token for the same actor. Riders are not copied. If the original is hidden, the copy is shown, except for anything that was already hidden before the group was. Nothing is added to the library; for a copy you want to place again and again, use **Save to Library**.

## If a group loses its pin

Deleting a group's pin, from Blacksmith's own pin menu or any other way, deletes the group, just as the **Delete** button on its card does: its record, its token and its parts go, and its riders are let go where they stand. A notice says so. Nothing is asked first, so use **Delete** on the card if you want to keep the parts. A group that lost its pin some other way, such as while no GM was connected, shows a warning on its card with **Make a New Pin**, which puts a new pin where the group last was and moves nothing.

## Delete a group

Choose **Delete** on the group. If it has parts you are asked to choose **Delete group only**, which leaves the parts on the map, or **Delete group and its parts**. Either way the pin and its token (see [Making a group something that can be attacked](userguide-targets.md)) are removed, riders are let go where they stand, and the library is not touched.

## Keep groups up to date

The **Tools** tab has **Update all groups**, which moves every group's parts to where its pin is now. This happens by itself while a GM is connected. Use it only after a pin moved while no GM was online. **Diagnose** beside each group writes a report of where its parts should be, against where they are, to the browser console (F12).
