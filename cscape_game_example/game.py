class Game:
    title = "Example Escape Room"

    def __init__(self, game_data_store):
        """Called once when the game starts. Use this to prepare the environment."""
        self.game_data_store = game_data_store
        pass

    # Add your check methods below. Each method should start with "check_" and
    # return True when the level is solved. Reference them in index.html via the
    # data-cscape-check attribute, e.g. <section data-cscape-check="check_example">.
    
    def check_example(self):
        return False
    
    # If you want to trigger some side effect when a level is solved, define a method
    # and reference it in index.html via the data-cscape-action attribute.
    # For example: <section data-cscape-check="check_example" data-cscape-action="example_solved">
    # You can reuse a single action for multiple checks by specifying the same action name
    # in multiple slides.
    def example_solved(self):
        pass

    # The following check checks multiple parts, e. g. ['a', 'b', 'c']
    # Return one of those elements (e.g. 'b') if a part is solved.
    # Return None if none of them is solved.
    def check_parallel(self, parts):
        return None
