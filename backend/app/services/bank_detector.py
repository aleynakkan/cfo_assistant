"""
Dynamic bank configuration and detection system.
Supports extensible bank formats for Excel processing.
"""

from typing import Dict, List, Optional
import pandas as pd
import logging

logger = logging.getLogger(__name__)

# Dynamic bank configuration
BANK_CONFIGS: Dict[str, Dict] = {
    "akbank": {
        "name": "Akbank",
        "headers_row": 9,  # 1-indexed row where headers start
        "data_start_row": 10,  # 1-indexed row where data starts
        "columns": {
            "date": ["tarih"],
            "time": ["saat"],  
            "amount": ["tutar"],
            "balance": ["bakiye"],
            "description": ["açıklama"],
            "reference": ["fiş/dekont no", "fış/dekont no"]
        },
        "date_format": "%d.%m.%Y",
        "decimal_separator": ","
    },
    "enpara": {
        "name": "Enpara",
        "headers_row": 11,
        "data_start_row": 12,
        "columns": {
            "date": ["tarih"],
            "type": ["hareket tipi"], 
            "description": ["açıklama"],
            "amount": ["işlem tutarı"],
            "balance": ["bakiye"]
        },
        "date_format": "%d.%m.%Y",
        "decimal_separator": ","
    },
    "yapikredi": {
        "name": "Yapı Kredi",
        "headers_row": 11,
        "data_start_row": 12,
        "columns": {
            "date": ["tarih"],
            "time": ["saat"],
            "transaction": ["işlem"],
            "channel": ["kanal"], 
            "reference": ["referans no"],
            "description": ["açıklama"],
            "amount": ["işlem tutarı"],
            "balance": ["bakiye"]
        },
        "date_format": "%d.%m.%Y",
        "decimal_separator": ","
    }
}

class BankDetector:
    """Detects bank type from Excel file structure."""
    
    def __init__(self):
        self.configs = BANK_CONFIGS
    
    def detect_bank(self, file_path: str) -> Optional[str]:
        """
        Detect bank type from Excel file structure.
        
        Args:
            file_path: Path to Excel file
            
        Returns:
            Bank code if detected, None otherwise
        """
        try:
            # Read first 20 rows for analysis
            df = pd.read_excel(file_path, nrows=20, header=None)
            
            for bank_code, config in self.configs.items():
                if self._matches_bank_structure(df, bank_code, config):
                    logger.info(f"Detected bank: {bank_code}")
                    return bank_code
            
            logger.warning(f"Could not detect bank for file: {file_path}")
            return None
            
        except Exception as e:
            logger.error(f"Error detecting bank from {file_path}: {str(e)}")
            return None
    
    def _matches_bank_structure(self, df: pd.DataFrame, bank_code: str, config: Dict) -> bool:
        """Check if DataFrame matches bank structure."""
        try:
            headers_row = config["headers_row"] - 1  # Convert to 0-indexed
            
            if len(df) <= headers_row:
                return False
            
            # Get actual headers from the specified row
            actual_headers = df.iloc[headers_row].fillna("").astype(str).str.lower().str.strip().tolist()
            
            # Count matches for required columns
            matches = 0
            required_columns = config["columns"]
            
            for col_type, possible_names in required_columns.items():
                for possible_name in possible_names:
                    if any(possible_name.lower() in header for header in actual_headers):
                        matches += 1
                        break
            
            # Require at least 60% of columns to match
            match_threshold = len(required_columns) * 0.6
            is_match = matches >= match_threshold
            
            logger.debug(f"Bank {bank_code}: {matches}/{len(required_columns)} matches, threshold: {match_threshold}, match: {is_match}")
            
            return is_match
            
        except Exception as e:
            logger.error(f"Error matching structure for {bank_code}: {str(e)}")
            return False
    
    def get_supported_banks(self) -> List[str]:
        """Get list of supported bank codes."""
        return list(self.configs.keys())
    
    def get_bank_config(self, bank_code: str) -> Optional[Dict]:
        """Get configuration for specific bank."""
        return self.configs.get(bank_code)

# Singleton instance
bank_detector = BankDetector()