import cscape

class Game:
    def __init__(self):
        """Called once when the game starts. Use this to prepare the environment."""
        pass

    # Add your check methods below. Each method should start with "check_" and
    # return True when the level is solved. Reference them in index.html via the
    # data-cscape-check attribute, e.g. <section data-cscape-check="check_example">.
    
    def check_example(self):
        return False


# Start the game
if __name__ == "__main__":
    cscape.run(Game())
