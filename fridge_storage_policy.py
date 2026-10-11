"""Conservative storage rules for this refrigerated food-bank unit, not a pantry."""
import re

def storage_verdict(name, details=None):
    details = details or {}
    product = details.get('catalog') or {}
    text = ' '.join(str(v or '') for v in [name, product.get('name'), details.get('product_name'), details.get('category')]).lower()
    storage = str(details.get('storage') or '').lower()
    if details.get('is_food') is False or details.get('fridge_ok') == 'no' or details.get('sealed') is False:
        return 'no', str(details.get('concern') or 'This item is unsuitable or its packaging is opened.')
    if re.search(r'\b(doritos|crisps|crackers|cookies|biscuits|candy|sweets|dry cereal|potato chips|tortilla chips)\b', text) or ('chips' in text and 'bag' in text):
        return 'no', 'This is dry pantry food, not refrigerated stock. Please take it to the food bank pantry collection instead.'
    if storage == 'frozen' or re.search(r'\b(ice cream|frozen)\b', text):
        return 'no', 'This item needs a freezer, not this refrigerated unit. Ask the food bank for freezer storage.'
    if details.get('fridge_ok') == 'unsure':
        return 'unsure', 'The item or packaging needs operator review.'
    if storage in ('refrigerate', 'refrigerated', 'keep refrigerated'):
        return 'yes', 'The package indicates refrigerated storage.'
    if re.search(r'\b(milk|yogurt|yoghurt|cheese|eggs|meat|chicken|fish|prepared meals|fresh fruit|fresh vegetables|produce|juice|soda|energy drink|water)\b', text):
        return 'yes', 'Suitable for chilled storage if sealed, in date and accepted by the food bank.'
    return 'unsure', 'Please read the package storage instructions. Only food for chilled storage belongs here; shelf-stable food goes to the pantry.'
