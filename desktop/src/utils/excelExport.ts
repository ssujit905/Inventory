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

    // Check if running in Electron
    if (window.ipcRenderer) {
        try {
            // Generate base64 string
            const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
            window.ipcRenderer.invoke('save-xlsx-download', { fileName: `${fileName}.xlsx`, base64: wbout })
                .then((res: any) => {
                    if (res?.ok) {
                        alert(`File saved to Downloads:\n${res.filePath}`);
                    } else {
                        console.error('Electron save error:', res?.error);
                        alert('Failed to save file');
                    }
                });
        } catch (e) {
            console.error('Electron export failed', e);
        }
    } else {
        // Browser fallback
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
    }
};
