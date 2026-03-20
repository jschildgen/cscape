import cscape

class Game:
    title = "Example Escape Room"

    def __init__(self):
        """Called once when the game starts. Use this to prepare the environment."""
        pass

    # Add your check methods below. Each method should start with "check_" and
    # return True when the level is solved. Reference them in index.html via the
    # data-cscape-check attribute, e.g. <section data-cscape-check="check_example">.
    
    def check_example(self):
        return False
    
    # If you want to trigger some side effect when a level is solved, define a method
    # with the same name as the check method, but with "_action" suffix, e.g. "check_example_action".

    def check_example_action(self):
        pass


# Start the game
if __name__ == "__main__":
    cscape.run(Game())
