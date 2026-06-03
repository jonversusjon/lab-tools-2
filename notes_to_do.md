drag and drop block should autoscroll screen to allow drag and drop of blocks outside of the viewport

experiment page blocks don't update when the databases do, for example, changing the name of a primary in the primaries database and returning to a page that has that antibody does not update its name, but it should

update the IF spectral view excitation and emission - reduce from 2 columns to just a single number that captures both (maybe yield or something), hovering the mouse over a yield value pops up a tooltip breaking it out by excitation efficiency and collection efficiency

*** need to implement copy to markdown for pasting into notion pretty soon ***

*** biotin is still registering n the if panel as a fluorophore instead of a chemical conjugate, so it is not letting me choose a fluorescent secondary ***


the fluorophore comparison tool is too small to read

if and flow panel tables should allow addition of multiples rows with no antibody selected. a user may want to his add add add to get 4 rows in the table and then decide colors first and then antibodies last. right now if user doesn't select an antibody, the row disappears.

spillover matrix needs to reorder when the target list rows are reordered so they always match


### Below Here should be implemented already
created new experiment with flow panel, filled out several things on the flow panel,navigated away and back, now the flow panel is blank, but using the browser refresh button correctly loads the panel with the data that was entered.

detectors need to be ordered by wavelength in the panel design tables from left to right, violet to red

editing IF panel on exp page, adding channel didn't add efficiency scores for secondary
changing secondary cleared the microscope channel, the channel should persist even if the secondary is changed, but the efficiency values should update when the secondary changes
DAPI produces no channel selector for IF panel and it should

tiptap blocks with placeholder text don't lose placeholder text (optional) nor show active cursor (required)

the IF panel block should default to having an editable panel title with  placeholder text, there should be a tiny hide title button on hover. the if panel blocks context menu should have both hide and show title included. hidden titles should just be hidden not erased or deleted

the undo stack needs to be overhauled to include every action, button, edit, move, reorder, delete, insert

experiment title on experiment page should be editable like a block, but not moveable like other blocks

should loction list be shared across resources

IN THE if panel spectral mode a blank channel box with no channels should not appear with no instrument selected. there needs to be an indication to the user that channel selection will become active once a microscope is selected. it could even be a link to select microscope from where the channel box appears after microscope is slected.

in IF panel, allow to create empty target row without selecting antibody, just an empty row with active controls that can be dragged, reordred and fille dout in whatever order

add toggles and heading toggles as basic block types

restore full width / page width toggle

move simple/spectral delete to block context menu in phase 9; microscope should only show when in spectral mode, when in spectral mode, the IF block context menu should also have show/hide options

heading blocks context menu should have change to... which also reveals the current block type (heading 1, 2, 3, etc)

we need to implement global duplicate block shortcut key and add duplicate to block context menu that duplicates block with all current values and properties

slash menu needs to implement . option; the way this works is slash brings up menu, user type IF for IF panel, instead of hitting enter they hit . which then brings up a picker for IF templates that include an omni box along with a favorites and recents section (separated by horizontal line) that can be accessed with up and down arrow

in flow panel adding a biotinylated antibody places biotin in the conjugate cell which is correct, but prevents selection of a fluorophore, biotin primaries require a streptavidin-fluorophore conjugate the logic should be to put the biotin as part of the host cell in the table and then follow all the same rules for the secondary selection but instead of just offering anti-host options, strep options should be present in the top of the dropdown menu

create template insert selection for all blocks with templates (IF, flow, qpcr, etc.). implement dot for template selections. if the user is using the / command menu and types enough letters to make a definite selection, if they click that selection or hit enter it inputs a blank of that block type. however if instead the user presses . then it autofills the reamining block title and pulls up a searchable dropdown omnibox with all the templates for that block type. a user can up arrow/down arrow to select template or click on template then it inserts that block with the template data prefilled.

