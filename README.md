# HackNC_Deploy-and-pray

## Overview
Cognishield is a cutting-edge project designed to enhance online interactions by detecting sycophantic behavior and providing real-time feedback. This project combines a robust backend powered by FastAPI and a sleek Chrome extension frontend to deliver a seamless user experience.

## Features
- **Sycophancy Detection**: Analyze text for sycophantic behavior and receive a risk score with detailed reasoning.
- **Fact Checker**: Verify the accuracy of statements directly within the extension.
- **Interactive UI**: A draggable and resizable sycophancy box with a tabbed interface for easy navigation.
- **Real-Time Feedback**: Get instant alerts on sycophantic behavior while browsing the web.

## Technologies Used
- **Backend**: FastAPI, Uvicorn, Python
- **Frontend**: Vanilla JavaScript, CSS3, Chrome Extension
- **Memory Layer**: Backboard AI SDK
- **Testing**: Pytest, Manual Testing

## Installation

### Prerequisites
- Python 3.11+
- Node.js (for Chrome extension development)
- Google Chrome browser

### Backend Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/AnushaU1111/HackNC_Deploy-and-pray.git
   cd HackNC_Deploy-and-pray/backend
   ```
2. Create a virtual environment and activate it:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up environment variables:
   - Create a `.env` file in the `backend` directory.
   - Add the following line to the file:
     ```
     BACKBOARD_API_KEY=your_api_key_here
     ```
5. Start the server:
   ```bash
   uvicorn main:app --reload
   ```
6. Access the API at `http://localhost:8000`.

### Frontend Setup
1. Navigate to the `extension` directory:
   ```bash
   cd ../extension
   ```
2. Load the Chrome extension:
   - Open `chrome://extensions/` in your browser.
   - Enable "Developer mode" (toggle in the top-right corner).
   - Click "Load unpacked" and select the `extension` folder.

## Usage
1. Open any website in Chrome.
2. Trigger the sycophancy detection by dispatching a custom event in the browser console:
   ```javascript
   window.dispatchEvent(new CustomEvent('shield_result', {
       detail: JSON.stringify({ score: 7, reason: "Response too agreeable", label: "DANGER" })
   }));
   ```
3. Interact with the sycophancy box:
   - Drag the box by clicking and holding the header.
   - Resize the box using the purple triangle in the bottom-right corner.
   - Switch between the "Sycophancy" and "Fact Checker" tabs.

## Testing
- Run the backend tests:
  ```bash
  pytest
  ```
- Manual testing guides are available in the `TESTING_GUIDE.md` file.

## Contributing
We welcome contributions! Please follow these steps:
1. Fork the repository.
2. Create a new branch:
   ```bash
   git checkout -b feature-name
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add feature description"
   ```
4. Push to your branch:
   ```bash
   git push origin feature-name
   ```
5. Open a pull request.

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.

## Contact
For any questions or feedback, please reach out to [AnushaU1111](https://github.com/AnushaU1111).

---

Happy coding! 🚀
