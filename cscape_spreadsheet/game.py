import requests
import configparser
import csv
import re
import cscape

class Game:
    title = "Spreadsheet Escape Room"
    sheet_csv_url : str

    def __init__(self):
        config = configparser.ConfigParser()
        config.read("config.ini")
        SHEET_URL = config.get("google_spreadsheet","sheet_url")
        SHEET_ID = SHEET_URL.split('/')[5]
        SHEET_GID = "0"
        self.sheet_csv_url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"

    def get_sheet_data(self):
        return list(csv.reader(requests.get(self.sheet_csv_url).text.splitlines()))

    def cell_value(self, cell):                         # e.g., A1
        sheet_data = self.get_sheet_data()
        col_abc = cell.rstrip("0123456789").upper()     # e.g., A
        row = int(cell[len(col_abc):])                  # e.g., 1
        col = 0
        for char in col_abc:
            col = col * 26 + (ord(char) - ord('A') + 1)
        try:
            return sheet_data[row-1][col-1]
        except:
            return ""

    def check_cell_not_empty(self, param):
        """Check if all specified cells are non-empty. 
           All values of those non-empty are written into the game data store.
        
        Args:
            param: Cell reference(s) separated by &, e.g., "A1&B2"
        
        Returns:
            True if all cells have values, False otherwise.
        """
        for cell in param.split("&"):
            cell_value = self.cell_value(cell)
            if cell_value == "":
                return False
            else:
                cscape.store(cell, cell_value)
        return True

    def check_cell_value(self, param):
        """Check if all specified cells have the expected values.
        
        Args:
            param: Cell reference and value pairs separated by &, e.g., "A1=5&BA15=Hello"
        
        Returns:
            True if all cells have the specified values, False otherwise.
        """
        for cell_ref in param.split("&"):
            cell, expected_value = cell_ref.split("=")
            cell_value = self.cell_value(cell)
            cscape.store(cell, cell_value)
            
            # If expected_value can be cast to float, do numeric comparison
            try:
                expected_float = float(expected_value)
                # Remove all non-numeric characters from cell_value and cast to float
                cleaned_cell_value = re.sub(r'[^\d.eE+-]', '', cell_value)
                try:
                    cell_float = float(cleaned_cell_value)
                except ValueError:
                    return False
                if cell_float != expected_float:
                    return False
            except (ValueError, TypeError):
                # expected_value is not numeric, do string comparison
                if cell_value != expected_value:
                    return False
        return True


if __name__ == "__main__":
    cscape.run(Game())