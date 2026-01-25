"""
Excel parser for bank transaction files.
Supports multiple bank formats with dynamic configuration.
"""

import pandas as pd
import hashlib
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Optional, Tuple
import logging
import re

from .bank_detector import bank_detector

logger = logging.getLogger(__name__)

class ExcelParser:
    """Parses bank Excel files into transaction data."""
    
    def __init__(self):
        self.detector = bank_detector
    
    def parse_file(self, file_path: str, company_id: int) -> Dict:
        """
        Parse Excel file and extract transactions.
        
        Args:
            file_path: Path to Excel file
            company_id: Company ID for transactions
            
        Returns:
            Dict with parsing results
        """
        try:
            # Calculate file hash for duplicate detection
            file_hash = self._calculate_file_hash(file_path)
            
            # Detect bank type
            bank_code = self.detector.detect_bank(file_path)
            if not bank_code:
                return {
                    "success": False,
                    "error": "Could not identify bank from file structure",
                    "file_hash": file_hash
                }
            
            # Get bank configuration
            config = self.detector.get_bank_config(bank_code)
            if not config:
                return {
                    "success": False, 
                    "error": f"No configuration found for bank: {bank_code}",
                    "file_hash": file_hash
                }
            
            # Parse transactions
            transactions = self._parse_transactions(file_path, config, company_id)
            
            return {
                "success": True,
                "bank_code": bank_code,
                "bank_name": config["name"],
                "transactions": transactions,
                "transaction_count": len(transactions),
                "file_hash": file_hash
            }
            
        except Exception as e:
            logger.error(f"Error parsing Excel file {file_path}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "file_hash": self._calculate_file_hash(file_path)
            }
    
    def _parse_transactions(self, file_path: str, config: Dict, company_id: int) -> List[Dict]:
        """Parse transactions from Excel using bank configuration."""
        try:
            # Read Excel file starting from data row
            skiprows = config["data_start_row"] - 1
            df = pd.read_excel(file_path, skiprows=skiprows)
            
            # Clean column names
            df.columns = df.columns.astype(str).str.lower().str.strip()
            
            transactions = []
            
            for index, row in df.iterrows():
                try:
                    transaction = self._parse_row(row, config, company_id)
                    if transaction:
                        transactions.append(transaction)
                except Exception as e:
                    logger.warning(f"Error parsing row {index + skiprows + 1}: {str(e)}")
                    continue
            
            return transactions
            
        except Exception as e:
            logger.error(f"Error parsing transactions: {str(e)}")
            raise
    
    def _parse_row(self, row: pd.Series, config: Dict, company_id: int) -> Optional[Dict]:
        """Parse a single row into transaction data."""
        try:
            # Find columns by matching configured names
            column_map = self._map_columns(row, config["columns"])
            
            # Extract date
            transaction_date = self._parse_date(row, column_map.get("date"), config.get("date_format", "%d.%m.%Y"))
            if not transaction_date:
                return None
            
            # Extract amount and determine direction
            amount, direction = self._parse_amount(row, column_map, config)
            if amount is None:
                return None
            
            # Extract description
            description = self._parse_description(row, column_map)
            if not description:
                return None
            
            # Extract optional fields
            external_id = self._extract_external_id(row, column_map)
            
            return {
                "date": transaction_date,
                "description": description.strip(),
                "amount": abs(amount),
                "direction": direction,
                "company_id": company_id,
                "external_id": external_id,
                "source": "EMAIL",
                "imported_at": datetime.now()
            }
            
        except Exception as e:
            logger.error(f"Error parsing row: {str(e)}")
            return None
    
    def _map_columns(self, row: pd.Series, column_config: Dict) -> Dict[str, str]:
        """Map actual column names to configured column types."""
        column_map = {}
        
        for col_type, possible_names in column_config.items():
            for possible_name in possible_names:
                for actual_col in row.index:
                    if possible_name.lower() in str(actual_col).lower():
                        column_map[col_type] = actual_col
                        break
                if col_type in column_map:
                    break
        
        return column_map
    
    def _parse_date(self, row: pd.Series, date_col: Optional[str], date_format: str) -> Optional[date]:
        """Parse date from row."""
        if not date_col or date_col not in row.index:
            return None
        
        try:
            date_value = row[date_col]
            
            if pd.isna(date_value):
                return None
            
            if isinstance(date_value, datetime):
                return date_value.date()
            
            if isinstance(date_value, date):
                return date_value
            
            # Try parsing string date
            date_str = str(date_value).strip()
            parsed_date = datetime.strptime(date_str, date_format)
            return parsed_date.date()
            
        except (ValueError, TypeError) as e:
            logger.debug(f"Error parsing date '{row.get(date_col, 'N/A')}': {str(e)}")
            return None
    
    def _parse_amount(self, row: pd.Series, column_map: Dict, config: Dict) -> Tuple[Optional[Decimal], Optional[str]]:
        """Parse amount and determine direction."""
        amount_col = column_map.get("amount")
        if not amount_col or amount_col not in row.index:
            return None, None
        
        try:
            amount_value = row[amount_col]
            
            if pd.isna(amount_value):
                return None, None
            
            # Clean and convert amount
            amount_str = str(amount_value).replace(config.get("decimal_separator", ","), ".")
            amount_str = re.sub(r'[^\d.-]', '', amount_str)  # Remove non-numeric chars except . and -
            
            if not amount_str:
                return None, None
            
            amount = Decimal(amount_str)
            
            # Determine direction based on amount sign
            if amount >= 0:
                direction = "in"
            else:
                direction = "out"
            
            return abs(amount), direction
            
        except (ValueError, InvalidOperation, TypeError) as e:
            logger.debug(f"Error parsing amount '{row.get(amount_col, 'N/A')}': {str(e)}")
            return None, None
    
    def _parse_description(self, row: pd.Series, column_map: Dict) -> Optional[str]:
        """Parse description from row."""
        desc_col = column_map.get("description")
        if not desc_col or desc_col not in row.index:
            return None
        
        try:
            desc_value = row[desc_col]
            
            if pd.isna(desc_value):
                return None
            
            return str(desc_value).strip()
            
        except Exception as e:
            logger.debug(f"Error parsing description: {str(e)}")
            return None
    
    def _extract_external_id(self, row: pd.Series, column_map: Dict) -> Optional[str]:
        """Extract external ID for duplicate detection."""
        ref_col = column_map.get("reference")
        if ref_col and ref_col in row.index and not pd.isna(row[ref_col]):
            return str(row[ref_col]).strip()
        
        # Fallback: create ID from date + amount + description
        try:
            date_col = column_map.get("date")
            amount_col = column_map.get("amount") 
            desc_col = column_map.get("description")
            
            parts = []
            if date_col and not pd.isna(row[date_col]):
                parts.append(str(row[date_col]))
            if amount_col and not pd.isna(row[amount_col]):
                parts.append(str(row[amount_col]))
            if desc_col and not pd.isna(row[desc_col]):
                parts.append(str(row[desc_col])[:50])  # First 50 chars
            
            if parts:
                return hashlib.md5("_".join(parts).encode()).hexdigest()[:16]
                
        except Exception:
            pass
        
        return None
    
    def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA-256 hash of file for duplicate detection."""
        try:
            with open(file_path, 'rb') as f:
                file_hash = hashlib.sha256()
                chunk = f.read(8192)
                while chunk:
                    file_hash.update(chunk)
                    chunk = f.read(8192)
                return file_hash.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash: {str(e)}")
            return f"error_{datetime.now().timestamp()}"

# Singleton instance
excel_parser = ExcelParser()