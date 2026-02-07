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
        "identifiers": ["akbank t.a.ş.", "akbank t.a.s.", "akbank", "ak bank"],
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
        "identifiers": ["enpara.com", "enpara", "qnb finansbank"],
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
        "identifiers": ["yapı ve kredi bankası", "yapı kredi", "yapikredi"],
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
            logger.info(f"Excel file loaded, shape: {df.shape}")
            
            # First, try to detect by bank identifiers in content
            bank_by_identifier = self._detect_by_identifiers(df)
            if bank_by_identifier:
                logger.info(f"Bank detected by identifier: {bank_by_identifier}")
                return bank_by_identifier
            
            # Fallback to structure-based detection
            logger.info("No bank identifier found, trying structure-based detection...")
            
            # Check banks in priority order (most common first)
            priority_order = ["akbank", "enpara", "yapikredi"]
            for bank_code in priority_order:
                if bank_code in self.configs:
                    config = self.configs[bank_code]
                    if self._matches_bank_structure(df, bank_code, config):
                        logger.info(f"Detected bank by structure: {bank_code}")
                        return bank_code
            
            # Check remaining banks
            for bank_code, config in self.configs.items():
                if bank_code not in priority_order:
                    if self._matches_bank_structure(df, bank_code, config):
                        logger.info(f"Detected bank by structure: {bank_code}")
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
                logger.debug(f"Bank {bank_code}: Not enough rows ({len(df)} <= {headers_row})")
                return False
            
            # Get actual headers from the specified row
            actual_headers = df.iloc[headers_row].fillna("").astype(str).str.lower().str.strip().tolist()
            logger.info(f"Bank {bank_code} - Row {headers_row}: Headers = {actual_headers}")
            
            # Count matches for required columns
            matches = 0
            required_columns = config["columns"]
            
            for col_type, possible_names in required_columns.items():
                for possible_name in possible_names:
                    if any(possible_name.lower() in header for header in actual_headers):
                        matches += 1
                        logger.debug(f"Bank {bank_code}: Found {col_type} -> '{possible_name}' in headers")
                        break
            
            # Require at least 60% of columns to match
            match_threshold = len(required_columns) * 0.6
            is_match = matches >= match_threshold
            
            logger.info(f"Bank {bank_code}: {matches}/{len(required_columns)} matches, threshold: {match_threshold:.1f}, match: {is_match}")
            
            return is_match
            
        except Exception as e:
            logger.error(f"Error matching structure for {bank_code}: {str(e)}")
            return False    
    def _detect_by_identifiers(self, df: pd.DataFrame) -> Optional[str]:
        """
        Detect bank by searching for bank identifiers in Excel content.
        
        Args:
            df: DataFrame containing Excel data
            
        Returns:
            Bank code if found by identifier, None otherwise
        """
        try:
            # Convert all cell values to lowercase strings for searching
            all_text = ""
            for row in df.values:
                for cell in row:
                    if pd.notna(cell):
                        all_text += str(cell).lower() + " "
            
            logger.info(f"=== BANK DETECTION DEBUG ===")
            logger.info(f"Excel content length: {len(all_text)}")
            logger.info(f"Excel content preview: {all_text[:500]}...")
            logger.info(f"Excel content tail: ...{all_text[-200:]}")
            
            # Check each bank's identifiers
            for bank_code, config in self.configs.items():
                identifiers = config.get("identifiers", [])
                logger.info(f"Checking {bank_code} identifiers: {identifiers}")
                for identifier in identifiers:
                    if identifier.lower() in all_text:
                        logger.info(f"✅ FOUND bank identifier '{identifier}' for {bank_code}")
                        return bank_code
                    else:
                        logger.info(f"❌ NOT found: '{identifier}' in content")
            
            logger.info("❌ No bank identifiers found in Excel content")
            return None
            
        except Exception as e:
            logger.error(f"Error detecting by identifiers: {str(e)}")
            return None    
    def detect_bank_from_filename(self, filename: str) -> Optional[str]:
        """Detect bank from filename patterns."""
        return "enpara"   
        
    
    def get_supported_banks(self) -> List[str]:
        """Get list of supported bank codes."""
        return list(self.configs.keys())
    
    def get_bank_config(self, bank_code: str) -> Optional[Dict]:
        """Get configuration for specific bank."""
        return self.configs.get(bank_code)

# Singleton instance
bank_detector = BankDetector()