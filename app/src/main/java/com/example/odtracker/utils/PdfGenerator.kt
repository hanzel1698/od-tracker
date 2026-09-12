package com.example.odtracker.utils

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.example.odtracker.data.model.OdAccountWithTransactions
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

object PdfGenerator {

    fun generateClosureRequestPdf(
        context: Context,
        bankName: String,
        branchName: String,
        branchAddress: String,
        userName: String,
        cifNo: String,
        savingsAccountNo: String,
        place: String,
        date: String,
        selectedOds: List<OdAccountWithTransactions>
    ): File? {
        val pdfDocument = PdfDocument()
        
        // A4 Size: 595 x 842 points (72 points per inch)
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create()
        val page = pdfDocument.startPage(pageInfo)
        val canvas = page.canvas
        
        val paint = Paint().apply {
            color = Color.BLACK
            textSize = 12f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            isAntiAlias = true
        }

        var y = 54f // Top margin
        val margin = 54f
        val lineSpacing = 18f

        // Helper to draw text line and increment y
        fun drawLine(text: String, size: Float = 12f, isBold: Boolean = false, isUnderline: Boolean = false, isRightAlign: Boolean = false) {
            paint.textSize = size
            paint.typeface = if (isBold) Typeface.create(Typeface.DEFAULT, Typeface.BOLD) else Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            paint.isUnderlineText = isUnderline
            
            if (isRightAlign) {
                paint.textAlign = Paint.Align.RIGHT
                canvas.drawText(text, 595f - margin, y, paint)
                paint.textAlign = Paint.Align.LEFT
            } else {
                canvas.drawText(text, margin, y, paint)
            }
            y += lineSpacing
        }

        // 1. To: Section
        drawLine("To,")
        drawLine("The Manager")
        drawLine(bankName)
        drawLine(branchName)
        drawLine(branchAddress)
        
        y += 10f // spacing

        // 2. From: Section
        drawLine("From,")
        drawLine(userName)
        drawLine("CIF No. - $cifNo")
        
        y += 15f // spacing

        // 3. Subject Section
        drawLine("Sub: Request for closure of OD account taken against FD and removal of lien", isBold = true)
        drawLine("     on corresponding FD", isBold = true)
        
        y += 15f // spacing

        // 4. Greeting
        drawLine("Sir,")
        
        y += 5f

        // 5. Body text with selective underlining
        fun drawFormattedBodyText(startX: Float, currentY: Float) {
            paint.textSize = 12f
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            
            val parts = listOf(
                Pair("I hereby request you to take necessary actions to ", false),
                Pair("close my OD accounts", true),
                Pair(" mentioned below and ", false),
                Pair("remove the lien", true),
                Pair(" against their linked FD Accounts.", false)
            )
            
            var currentX = startX
            var drawY = currentY
            
            for (part in parts) {
                paint.isUnderlineText = part.second
                val words = part.first.split(" ")
                for (i in words.indices) {
                    val word = words[i] + (if (i < words.size - 1) " " else "")
                    val width = paint.measureText(word)
                    if (currentX + width > 595f - margin) {
                        currentX = margin
                        drawY += lineSpacing
                    }
                    canvas.drawText(word, currentX, drawY, paint)
                    currentX += width
                }
            }
            y = drawY + lineSpacing
        }

        drawFormattedBodyText(margin, y)
        y += 15f // spacing

        // 6. Draw Table
        val tableTop = y
        val colWidth = (595f - 2f * margin) / 2f
        
        // Header background/text
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        paint.isUnderlineText = false
        canvas.drawText("OD Account", margin + 12f, y + 16f, paint)
        canvas.drawText("Linked FD Account", margin + colWidth + 12f, y + 16f, paint)
        
        y += 24f // Header row height

        // Rows
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
        for (od in selectedOds) {
            canvas.drawText(od.account.odNumber, margin + 12f, y + 16f, paint)
            canvas.drawText(od.account.underlyingFdNo, margin + colWidth + 12f, y + 16f, paint)
            y += 24f // Row height
        }
        val tableBottom = y

        // Draw Table Grid Lines
        paint.style = Paint.Style.STROKE
        paint.color = Color.DKGRAY
        paint.strokeWidth = 1f
        
        // Outer Rectangle
        canvas.drawRect(margin, tableTop, 595f - margin, tableBottom, paint)
        // Header separator line
        canvas.drawLine(margin, tableTop + 24f, 595f - margin, tableTop + 24f, paint)
        // Inner vertical line separating columns
        canvas.drawLine(margin + colWidth, tableTop, margin + colWidth, tableBottom, paint)
        // Horizontal rows lines
        var rowY = tableTop + 24f
        for (i in 1 until selectedOds.size) {
            rowY += 24f
            canvas.drawLine(margin, rowY, 595f - margin, rowY, paint)
        }
        
        // Restore paint styles
        paint.style = Paint.Style.FILL
        paint.color = Color.BLACK
        
        y += 20f // spacing after table

        // 7. Debit Authorization body text
        fun drawDebitAuthText(currentY: Float) {
            paint.isUnderlineText = false
            paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
            val text = "The closure can be made by debiting the required amount from my Savings Account No. $savingsAccountNo."
            var currentX = margin
            var drawY = currentY
            val words = text.split(" ")
            for (word in words) {
                val formattedWord = "$word "
                val width = paint.measureText(formattedWord)
                if (currentX + width > 595f - margin) {
                    currentX = margin
                    drawY += lineSpacing
                }
                canvas.drawText(formattedWord, currentX, drawY, paint)
                currentX += width
            }
            y = drawY + lineSpacing
        }
        
        drawDebitAuthText(y)
        
        y += 25f // spacing

        // 8. Closing
        drawLine("Thanking you", isRightAlign = true)
        y += 25f
        drawLine(userName, isRightAlign = true)
        
        y += 35f // spacing

        // 9. Footer (Place & Date)
        drawLine("PLACE: ${place.uppercase(Locale.getDefault())}", isBold = true)
        drawLine("DATE: $date", isBold = true)

        pdfDocument.finishPage(page)

        // Save PDF to context's cache directory for sharing
        val fileName = "Closure_of_OD_${System.currentTimeMillis()}.pdf"
        val pdfFile = File(context.cacheDir, fileName)
        
        return try {
            val outputStream = FileOutputStream(pdfFile)
            pdfDocument.writeTo(outputStream)
            outputStream.flush()
            outputStream.close()
            pdfDocument.close()
            pdfFile
        } catch (e: Exception) {
            e.printStackTrace()
            pdfDocument.close()
            null
        }
    }
}
