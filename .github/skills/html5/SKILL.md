---
name: html5-best-practices
description: "Automated HTML5 quality checks — monitors semantic rules, code optimization tags, and core structural standards."
trigger: pull-request
---

### Project Name: HTML5 Best Practices Guide

A brief description of your web project goes here. Explain what this project does and why following HTML5 standards matters for your team. 

### 🏗️ Semantic Structure Blueprint

We use **Semantic HTML5** to ensure our code is meaningful to both browsers and search engines. Every page must follow this layout structure: 

html

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Standard Page Template</title>
</head>
<body>

    <!-- Header: Contains logo and main menu -->
    <header>
        <img src="logo.svg" alt="Company Logo">
        <nav>
            <ul>
                <li><a href="#home">Home</a></li>
                <li><a href="#about">About</a></li>
            </ul>
        </nav>
    </header>

    <!-- Main: Holds the unique core content -->
    <main>
        <section id="hero">
            <h1>Welcome to Our Site</h1>
        </section>

        <section id="news">
            <h2>Latest Updates</h2>
            <article>
                <h3>Article Title</h3>
                <p>Content goes here...</p>
            </article>
        </section>
    </main>

    <!-- Footer: Copyright and secondary links -->
    <footer>
        <p>&copy; 2026 Company Name. All rights reserved.</p>
    </footer>

</body>
</html>

Use code with caution.

### ♿ Accessibility (a11y) Checklist

Ensure every page meets these baseline accessibility requirements before shipping: 

* [ ] **Language Tag:** The <html> element must have a valid lang attribute (e.g., lang="en").
* [ ] **Image Alts:** All <img> tags must include meaningful alt descriptions. Use alt="" only for decorative graphics.
* [ ] **Form Labels:** Every input must be paired with a <label> element using matching id and for attributes.
* [ ] **Heading Hierarchy:** Use headings (<h1> through <h6>) in strict sequential order. Never skip levels for styling purposes.

### ⚡ Performance Rules

Keep the website fast by utilizing modern HTML attributes: 

1. **Lazy Loading:** Add loading="lazy" to images below the fold.
2. **Non-blocking Scripts:** Add the defer attribute to external JavaScript files in the <head>.
3. **Clean Code:** Omit outdated attributes like type="text/javascript" or type="text/css".

### 🛠️ Code Quality Tools

Validate your HTML file structure using official industry standards: 

* [W3C HTML Validator](https://validator.w3.org/) - Checks for syntax errors and broken tags.
* [WCAG 2.2 Accessibility Checker](https://www.w3.org/TR/WCAG22/) - Scans the page for hidden accessibility issues.