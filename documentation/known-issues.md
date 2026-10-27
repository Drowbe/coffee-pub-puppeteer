# Known Issues

**Audience:** everyone using Puppeteer.

Limits we know about and have not removed, with a way round where there is one.

- **Lights, walls, sounds and regions jump.** They take part in perception, and Foundry recalculates sight and walls from their saved positions, so they cannot be drawn in between. Tiles, drawings, notes and riders glide. A group with lights on a cart shows them snap to the new place at the end of each move.
- **The body token jumps, and its outline is a box that does not turn.** A token's footprint is axis-aligned, so at a diagonal heading the body covers more than the group does.
- **Moving a locked body by hand is refused.** That is the point of locking it, and it also means the GM cannot nudge it. Move the group by its pin.
- **With Tokens board when they move onto it on, every token boards, enemies included.** Switch the option off, or dismount the token, if that is not wanted.
- **Regions with token or grid shapes cannot be carried.** They are refused with a reason.
- **Compendium actors cannot be dropped on a body row.** Import them into the world first.
- **Walls and notes cannot be hidden.** Foundry gives them no hidden state, so hiding a group leaves them visible. Riders are never hidden.
- **Levels are ignored.** A group moves on the level it was made on and carries its parts' levels as they were. It does not follow its pin to another level.
- **A pin is never snapped for the group.** Members keep their exact offsets from the pin, so a pin dropped on a grid snap does not pull the parts onto the grid.
- **No GM, nothing moves.** Only the active GM writes, so a pin moved while no GM is connected moves its group when a GM next connects.
