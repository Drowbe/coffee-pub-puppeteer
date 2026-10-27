# Verification Owed in Foundry

**Audience:** the author, running a world.

Everything below has shipped and has not been proven in a running world. The automated suite (`node --test tests/*.test.mjs`) covers the logic under a stand-in for Foundry; none of it has seen a real canvas, a second client or a player.

**Proven in Foundry by the author:** pin groups moving and turning by dragging the pin; Centre Pivot; hand edits being kept; member names; the bounds overlay; the Group Editor window and its group controls; regions as members; the body token following a pin drag after the options fix; boarding a token by dropping an actor on the group and by Board Selected; riders staying aboard through a long move.

**Not proven:** everything listed here. Delete an item once it passes. Delete this file when it is empty.

## Group cards, hiding and the library editor

- [ ] With the Blacksmith that has tool-themed toggles and badges (in its working tree, not yet released), the toggle labels, the off sliders and the badges are readable on the Light theme, and still right on Dark and Glass.
- [x] With the Blacksmith that has the tool-window controls (working tree, not yet released): every button in the editor is the shared 24px button, the icon-only ones are square with a tooltip, Delete, Remove and Clear turn red on hover, Hide, Show and Move Pivot show the orange selected state, and the footer New Group and Import are the compact themed footer buttons.
- [x] The body's drop target is a dashed zone that turns solid orange while an actor is dragged over it, and a calm solid border once it holds an actor.
- [x] Each group is a Blacksmith card: the caret turns when it opens, clicking the title line or the caret opens and closes it, pressing Go To Pin, Hide or Delete never opens or closes it, and an open card stays open when the editor redraws. The group's name is text with a pencil in the card's title: the pencil turns it into a field with the text selected, Enter, Tab or clicking away saves it, Escape puts it back and returns focus to the pencil, an empty group or entry name is refused, and neither opens or closes the card. The same pencil works on a part's name and on a library entry's name and description, and a scene change while typing does not take the field away.
- [x] Clicking anywhere on a part's row selects it on the map (a wall or a light is easy to pick out), Shift adds, the map pans to an off-screen part, and the pencil, eye and remove buttons still do their own job. The same for a rider's row. There is clear space between the controls in each section.
- [x] Sections inside an open card have a rule above each one and a small caption, and hints and empty states read on the Light theme.
- [x] The on/off options (Turns with its pin, Announce boarding, Riders move freely; Tokens board; Linked) are compact switches, one to a line, the switch first and its label after it, in normal case. Clicking the switch or the label flips only that option, and the off and on states are readable on the Light theme.
- [x] Moves by is a segmented control: Gliding, Travelling or Jumping, the chosen one filled orange, arrow keys move it, and choosing one saves it and enables or disables the milliseconds field.
- [x] The tab bar is underline tabs with a count pill that lines up with its label, the open tab has an orange underline, and the inactive tabs are readable. The four select-by-type buttons under Parts are one joined row.
- [x] The editor looks right in the Light, Dark and Glass themes: the tabs, the list rows and the badges are Blacksmith's own, there is 8px of padding round the body, and nothing is a stray dark panel on the Light theme.
- [x] A closed card shows name, parts, heading and the icon buttons (go to pin, hide, play or pause, duplicate, library, export, delete) on one line at the default window width, and again at a narrow one. Opening and closing a card works, and an open card stays open while you drag a pin.
- [x] The editor's scroll position does not jump when a group moves while you are scrolled down.
- [ ] A light and a sound have a power button, lit orange while on, that turns them off and on (the same as double-clicking them); a tile, a drawing and a region have an eye. Hide hides a tile and a region and turns a light and a sound off, leaves a wall and a note, and Show restores them. A part hidden before the group was hidden stays hidden. The eye on a part works.
- [x] A hidden group still follows its pin, and a player cannot see its hidden parts.
- [x] Rename and describe a library entry, then Replace from Group (the list shows this scene's groups; choosing one replaces the entry; Cancel changes nothing), and check copies already placed are unchanged. Fabricate works.

## Duplicate

- [ ] The copy button on a card makes a second group two squares to the right with its own pin and parts, and the new card opens. The two move independently. A group with a body gets a second body; riders stay on the original.

## Move Pivot

- [ ] Choose Move Pivot on a group with a rider and a body. Drag the pin to the prow. Nothing else moves, and the button and notice switch off by themselves when the pin is dropped.
- [ ] Drag the pin again and the whole group follows. Turn it with Shift and the wheel and the group turns about the new grip.
- [ ] Choose Move Pivot, then choose it again before dragging: it cancels.

## Behaviour

- [x] Moves by Gliding: the group glides on a pin drop and follows the pointer during a drag. With 1000 ms it takes visibly longer.
- [x] Moves by Travelling at 6 squares a second: a six-square move takes about a second, a twelve-square move about two, a nudge is not instant, a half turn takes about a second, the members and riders move at a steady pace (not slowing at the end), and a drag still follows the pointer. The pace field appears for Travelling and the milliseconds field for Gliding.
- [x] Moves by Jumping: no movement between the two places and nothing follows a drag.
- [x] Riders glide along with the group, and a turn swings them on an arc.
- [x] Turns when its pin turns, switched off: turning the pin turns nothing, the heading field and rotate buttons are disabled, moving the pin still carries the group. Switch it back on and nothing swings.
- [ ] Riders can move about, switched off: a rider moved by hand goes straight back.
- [ ] Announce boarding in chat: a public card and a soft sound for everyone when a token boards, and when it leaves.

## Riders

- [ ] With Tokens board when they move onto it turned on, a player drags their own token onto the group and it boards. A player drags it off and it dismounts, with a toast.
- [ ] A rider walked about inside the group stays where it was put through the next move.
- [ ] Dismount stays off while the token is still on the group, and boards again after it has left and come back.
- [ ] Deleting the group lets its riders go where they are.

## Body token

- [ ] Drag an actor onto a group's body row, use Use Selected Token, turn Linked on and off, and use the cross to remove it.
- [ ] The body follows a drag, a turn, and added or removed parts.
- [ ] A truly transparent token draws no shadow or border.
- [ ] A tile or light under the footprint can still be clicked.
- [ ] A teleport move of the body does not count against combat movement.

## Library

- [ ] Save a group to the library and the entry shows a picture of it: the tiles' images where they sit, walls as dark lines, lights and sounds as dots, centred in a square with nothing of the map under it. Replace from Group redraws it. A tile that is a video or a missing image shows as a plain box.

- [ ] A group with Tokens board when they move onto it, Travelling, Faces its travel and an event, saved to the Library and fabricated again: the copy has the same switches and settings, a token dragged onto it boards, and its event runs. An entry saved before this fix has none of it and is saved again first.
- [ ] Save, Stamp, Import and Export. A stamp of a group that has a body, once turned, has its own body for that stamp.
- [ ] A stamp in a world without that actor has no body and a toast says so.

## Other

- [ ] A world that has a group saved with a token anchor (an earlier build) opens with it as a pin group where the token was, nothing moved, the token unchanged, and one toast.
- [ ] Duplicate a scene that has groups, riders and a body. Move a group on each scene: both work and neither disturbs the other.
- [ ] Undo (Ctrl+Z) of a rider's move, and a rider whose move is paused or stopped partway, leave it where Foundry committed it.
- [ ] Capture Area (with a region inside the box too, now that Blacksmith picks regions), the pin menu, double-clicking a pin, the Group Editor tabs and delete flows, and the menubar: one Puppeteer button in the middle zone beside the other Coffee Pub tools, nothing of Puppeteer in the left zone, the button opens a bar below with Group Editor, New Group, Update All Groups and Group Bounds, the button stays lit while the bar is open, and Group Bounds lights while the overlay is on.
- [ ] Events: on a group's card, add Play a sound on "The group moves" (with the folder button) and Run a macro on "A token boards" (the macro posts `scope.event.token.name` to chat). Move the pin: the sound plays on a player's screen too. Board a token: the macro runs once. Delete the macro: the next board reports a failure and the boarding still happens. Remove an event with its cross.
- [ ] Pause and Play: a group with no Play or Pause event has no Pause button and no pin menu item. Add "Pause is clicked: Stop the animations" and "Play is clicked: Start the animations" to a group with a looping video tile: the button appears, Pause stops the video on the GM's screen and a player's, Play starts it again, both survive reloading the scene. Add a Play a sound event to each side and hear it on a player's screen. Start the animations on Pause also works, and a group with no video tile still runs its other events.
- [ ] Faces its travel and Travelling: with Faces its travel on, drag the pin east of a group with its front down; on a Gliding group it turns toward the pointer as you drag and stays that way on the drop. On a Travelling group nothing moves while you drag, and on the drop it sets off, turning and moving together at a steady pace to the pin, then the pin turns to match. A short nudge (under a quarter of a square) does not turn it. If it faces the wrong way, note which way the picture's front points.
- [ ] Solid parts only (boarding by the picture's solid part works in Foundry; still to try: a rider moved onto a corner is let go, and the toggle off): with a ship tile whose picture has transparent corners, drop a token on a corner and it does not board; drop one on the hull and it does. Move a rider from the hull onto a corner and it is let go. Turn Solid parts only off and the corner boards. Also try a rotated and a scaled tile, a tile with a custom alpha threshold, a video tile, and boarding while the group is gliding.
- [ ] Resize: with a group of a tile, a drawing, a light, a sound, a wall, a note and a region (rectangle and polygon), plus a rider and a token, choose Bigger then Smaller with the step at 2, and at 1.25. Everything grows about the pin (a light reaches further, a sound has a larger radius, the rider stands further out, the token covers the bigger group) and then returns to where it was. Reset after several resizes puts the group back, and is greyed for a group that was never resized. Type a Width in squares: the group becomes that wide. Try a very small and a very large factor with the `scale` macro call.
- [ ] Damage levels, in each game system you use: give a group a token, add Bloodied "Show a picture on a tile" and Healthy back to the first picture, then damage and heal the token (linked, then unlinked). The picture changes at the Bloodied line set in Blacksmith, not on every hit, and returns when healed. Also confirm the unlinked case: damage on the token alone reaches the group.
- [ ] `game.modules.get('coffee-pub-puppeteer').api.getState(groupId)` in a macro, read on an interval while a group travels: `moving` is true and `speed` is near the pace set for Travelling, then `moving` is false and `speed` is 0.
- [ ] Faces its travel: with a boat or cart drawn front-down, switch it on and drag the pin in each direction. The group turns to head the way it went and the pin turns with it; a tiny nudge does not turn it; Shift + wheel on the pin during a move is obeyed.
- [ ] Right-click a group's pin: Hide or Show Group, Switch Group Lights On or Off, Switch Group Sounds On or Off and Duplicate Group each work and show a toast. A group with no lights has no lights item, and one with no sounds has no sounds item.
- [ ] Delete a group's pin from Blacksmith's own pin menu, and again with Manage Pins' bulk delete of the pins of one type. The group is deleted with a notice, its parts and any body token go, and riders stay where they stand with no link. The Delete button on a card still works and asks whether to remove the parts.
- [ ] Every Puppeteer toast can be switched off with the Puppeteer channel in Blacksmith's notification settings.

## User guides

- [ ] Walk each guide in `documentation/userguides/` in a running world, as a GM and then as a player. The player guide is the most likely to be wrong, because its claims about what a player sees come from reading the code.
