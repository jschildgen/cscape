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
    # and annotate it with @cscape.action_for, referencing the check method. 
    # For example, the following method will be called when check_example() returns True.
    # You can reuse a single action for multiple checks by passing a comma-separated list 
    # of check method names, for example: @cscape.action_for("check_example1, check_example2"])

    @cscape.action_for("check_example")
    def example_solved(self):
        pass


# Start the game
if __name__ == "__main__":
    cscape.run(Game())
