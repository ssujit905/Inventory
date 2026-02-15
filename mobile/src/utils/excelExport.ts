import * as XLSX from 'xlsx';

/**
 * Exports data to an Excel file (.xlsx)
 * @param data Array of objects representing the data
 * @param fileName Name of the file to be saved (without extension)
 * @param sheetName Name of the sheet in the Excel file
 */
export const exportToExcel = (data: any[], fileName: string, sheetName: string = 'Sheet1') => {
    // Create a worksheet from the data
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Generate workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Trigger browser download
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
