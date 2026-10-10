import os
import unittest
from unittest.mock import patch
from backend.app.main import create_video_manager
from backend.app.media import RecordedManager


class OptionalDetectionStartupTests(unittest.TestCase):
    def test_windows_library_block_does_not_stop_website(self):
        with patch.dict(os.environ, {'SHELTER_ENABLE_AI': '1'}), patch('backend.app.main.import_module', side_effect=OSError(4551, 'Application Control blocked library')):
            with self.assertLogs('backend.app.main', level='WARNING'):
                manager = create_video_manager()
        self.assertIsInstance(manager, RecordedManager)
        self.assertEqual(len(manager.states()), 4)
        self.assertTrue(all(feed['ai_status'] == 'Not connected' for feed in manager.states()))

    def test_disabled_detection_does_not_import_native_libraries(self):
        with patch.dict(os.environ, {'SHELTER_ENABLE_AI': '0'}), patch('backend.app.main.import_module') as load:
            self.assertIsInstance(create_video_manager(), RecordedManager)
            load.assert_not_called()

    def test_available_detection_is_retained(self):
        with patch.dict(os.environ, {'SHELTER_ENABLE_AI': '1'}), patch('backend.app.main.import_module') as load:
            expected = load.return_value.ProcessorManager.return_value
            self.assertIs(create_video_manager(), expected)
