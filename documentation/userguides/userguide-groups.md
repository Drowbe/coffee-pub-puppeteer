# Building and Moving Groups

**Audience:** game masters building carts, ships, drawbridges and stages.

Everything here is GM only. A group is a pin on the map plus the tiles, drawings, lights, sounds, walls, notes and regions that travel with it.

## Add and remove parts

1. Open the Group Editor with **Puppeteer Groups** in the toolbar. Each group on the **Scene Groups** tab is a card. A closed card is one line: its name, how many parts it has and which way it faces, with **Go To Pin**, **Hide** and icons beside them to duplicate the group, save it to the Library (the same icon as the Library tab), export it as a file, and delete it. An open card shows Token, Riders, Behaviour, Position, Events and Parts, in that order. Choose the arrow at its left to open it. Open cards stay open until you close them.
2. Select objects on the map and choose **Add Selected**. Foundry shows one layer at a time, so add one layer's objects, then switch layers and add the next. Regions are added this way too.
3. Or choose **Capture Area** and drag a box. Everything inside it, on every layer, joins the group.
4. To take parts out, select them and choose **Remove Selected**, or use the cross beside a part under **Parts**.

Right-clicking the pin gives the same actions, and double-clicking the pin opens the Group Editor on that group. The pin menu also has **Hide or Show Group**, **Switch Group Lights On or Off** and **Switch Group Sounds On or Off** (each shown only if the group has any) and **Duplicate Group**. The lights and sounds items flip them together: if any is on they all go off, and if none is they all come on.

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

Both are under **Position** on an open card.

- **Centre Pivot** moves the pin to the middle of the group without moving anything, so the group turns about its own centre.
- **Move Pivot** puts the pin anywhere, such as the prow of a ship, a wagon's hitch or a door's hinge. Choose **Move Pivot** on the group (the button turns blue and a notice appears) and drag the pin to where you want it. The pin moves, nothing else does, and Move Pivot switches itself off when you drop the pin. After that the group moves and turns about the new spot. Choose **Move Pivot** again before dragging to cancel.

## Resize a group

Under **Position** on an open card, choose **0.5×**, **0.8×**, **1.25×** or **2×**. The group grows or shrinks about its pin: every part sits that many times as far from the pin and is that many times as big, so tiles, drawings, lights, sounds and regions all keep their proportions, and walls and notes move to the new distance. Riders stand that many times as far from the pin but keep their own size, and a group's token is refitted to cover the new size. Resize by 2 and then by 0.5 and everything is back where it was, except that a drawing's size is kept to whole pixels. From a macro, `scale(groupId, factor)` takes any factor from 0.1 to 10.

## Edit parts by hand

Move, turn or resize any part directly on the map. The group remembers the new position and nothing snaps back on the next move.

## Duplicate a group

Choose the copy button on a group's card. A new group appears two squares to the right of the original, named with "copy" after it, with its own parts and its own pin, facing the same way. It keeps the original's behaviour settings and, if the original can be attacked, gets its own token for the same actor. Riders are not copied. If the original is hidden, the copy is shown, except for anything that was already hidden before the group was. Nothing is added to the library; for a copy you want to place again and again, use **Save to Library**.

## If a group loses its pin

If a pin is deleted, the group's card says so and the group cannot be moved. Choose **Make a New Pin** on the card. A new pin appears where the group last was, facing the way it faced, and nothing on the map moves. The group follows the new pin as it did the old one. A group nobody wants any more can be deleted instead.

## Delete a group

Choose **Delete** on the group. If it has parts you are asked to choose **Delete group only**, which leaves the parts on the map, or **Delete group and its parts**. Either way the pin and its token (see [Making a group something that can be attacked](userguide-targets.md)) are removed, riders are let go where they stand, and the library is not touched.

## Keep groups up to date

The **Tools** tab has **Update all groups**, which moves every group's parts to where its pin is now. This happens by itself while a GM is connected. Use it only after a pin moved while no GM was online. **Diagnose** beside each group writes a report of where its parts should be, against where they are, to the browser console (F12).
